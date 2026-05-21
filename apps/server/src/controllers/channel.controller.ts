import { Request, Response } from "express";
import pool from "../lib/pg";
import { RedisService } from "../services/redis.service";
import { ChannelService } from "../services/channel.service";

function handleChannelError(error: unknown, res: Response): Response {
  console.error("❌ Channel Controller Error:", error);
  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: "Internal server error" });
}

export async function createChannelHandler(req: Request, res: Response): Promise<Response> {
  const client = await pool.connect();
  try {
    const creatorId = req.auth?.userId;
    if (!creatorId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { channelType, groupName, groupDescription, memberIds = [] } = req.body;

    if (!channelType || !["direct", "group"].includes(channelType)) {
      return res.status(400).json({ error: "Invalid or missing channelType ('direct' | 'group')" });
    }

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: "memberIds must be an array" });
    }

    if (channelType === "direct" && memberIds.length === 0) {
      return res.status(400).json({ error: "At least one memberId is required for direct channels" });
    }

    // De-duplicate and ensure creator is included
    const distinctMembers = Array.from(new Set([creatorId, ...memberIds]));

    await client.query("BEGIN");

    // For direct channels, check if a direct channel already exists between these precise two users
    if (channelType === "direct") {
      if (distinctMembers.length !== 2) {
        throw new Error("Direct channel must have exactly 2 distinct members");
      }

      const existingDirectQuery = `
        SELECT c.id FROM channels c
        JOIN channel_members cm1 ON c.id = cm1.channel_id
        JOIN channel_members cm2 ON c.id = cm2.channel_id
        WHERE c.channel_type = 'direct'
          AND cm1.user_id = $1 AND cm1.left_at IS NULL
          AND cm2.user_id = $2 AND cm2.left_at IS NULL
      `;
      const existingDirectResult = await client.query(existingDirectQuery, [distinctMembers[0], distinctMembers[1]]);
      
      if (existingDirectResult.rows.length > 0) {
        await client.query("ROLLBACK");
        const channelId = existingDirectResult.rows[0].id;
        
        // Fetch full existing channel details
        const fullChannelQuery = `
          SELECT id, channel_type, group_name, group_description, created_at, updated_at 
          FROM channels WHERE id = $1
        `;
        const ch = await pool.query(fullChannelQuery, [channelId]);
        return res.status(200).json({
          channel: ch.rows[0],
          isExisting: true,
          message: "Existing direct channel returned",
        });
      }
    }

    // Insert new channel
    const insertChannelQuery = `
      INSERT INTO channels (channel_type, group_name, group_description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, channel_type, group_name, group_description, created_at, updated_at
    `;
    const channelResult = await client.query(insertChannelQuery, [
      channelType,
      channelType === "group" ? groupName || "New Group Chat" : null,
      channelType === "group" ? groupDescription || null : null,
      creatorId,
    ]);

    const newChannel = channelResult.rows[0];

    // Add members
    const insertMemberQuery = `
      INSERT INTO channel_members (channel_id, user_id, role)
      VALUES ($1, $2, $3)
    `;
    for (const memberId of distinctMembers) {
      const role = memberId === creatorId ? "owner" : "member";
      await client.query(insertMemberQuery, [newChannel.id, memberId, role]);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      channel: newChannel,
      isExisting: false,
      message: "Channel created successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return handleChannelError(error, res);
  } finally {
    client.release();
  }
}

export async function getUserChannelsHandler(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch active channels from PostgreSQL
    const channelsQuery = `
      SELECT c.id, c.channel_type, c.group_name, c.group_description, c.created_at, c.updated_at,
             cm.role, cm.joined_at, cm.is_muted, cm.is_pinned, cm.is_archived
      FROM channels c
      JOIN channel_members cm ON c.id = cm.channel_id
      WHERE cm.user_id = $1 AND cm.left_at IS NULL AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
    `;
    const channelsResult = await pool.query(channelsQuery, [userId]);
    const channels = channelsResult.rows;

    const channelIds = channels.map((c) => c.id);

    // Retrieve unread counts from Redis Service pipeline
    const unreadCounts = await RedisService.getUnreadCounts(userId, channelIds);

    // Map unread counts onto channel results
    const responseChannels = channels.map((c) => ({
      ...c,
      unreadCount: unreadCounts[c.id] || 0,
    }));

    return res.status(200).json({ channels: responseChannels });
  } catch (error) {
    return handleChannelError(error, res);
  }
}

export async function addChannelMemberHandler(req: Request, res: Response): Promise<Response> {
  const client = await pool.connect();
  try {
    const callerId = req.auth?.userId;
    const { id: channelId } = req.params;
    const { userId: targetUserId } = req.body;

    if (!callerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: "target userId is required" });
    }

    await client.query("BEGIN");

    // Verify caller is an active member
    const checkCallerQuery = `
      SELECT role FROM channel_members
      WHERE channel_id = $1 AND user_id = $2 AND left_at IS NULL
    `;
    const callerResult = await client.query(checkCallerQuery, [channelId, callerId]);
    if (callerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not a member of this channel" });
    }

    // Check if target user is already a member
    const checkTargetQuery = `
      SELECT joined_at, left_at FROM channel_members
      WHERE channel_id = $1 AND user_id = $2
    `;
    const targetResult = await client.query(checkTargetQuery, [channelId, targetUserId]);

    if (targetResult.rows.length > 0) {
      const { left_at } = targetResult.rows[0];
      if (left_at === null) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "User is already an active member of this channel" });
      }

      // Re-activate member if they previously left
      const reactivateQuery = `
        UPDATE channel_members
        SET left_at = NULL, joined_at = NOW(), role = 'member'
        WHERE channel_id = $1 AND user_id = $2
      `;
      await client.query(reactivateQuery, [channelId, targetUserId]);
    } else {
      // Create new membership row
      const insertQuery = `
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES ($1, $2, 'member')
      `;
      await client.query(insertQuery, [channelId, targetUserId]);
    }

    await client.query("COMMIT");

    return res.status(200).json({ message: "Member added successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    return handleChannelError(error, res);
  } finally {
    client.release();
  }
}

export async function removeChannelMemberHandler(req: Request, res: Response): Promise<Response> {
  try {
    const callerId = req.auth?.userId;
    const { id: channelId, userId: targetUserId } = req.params;

    if (!callerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify caller membership and role
    const callerMembershipQuery = `
      SELECT role FROM channel_members
      WHERE channel_id = $1 AND user_id = $2 AND left_at IS NULL
    `;
    const callerResult = await pool.query(callerMembershipQuery, [channelId, callerId]);
    if (callerResult.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this channel" });
    }

    const callerRole = callerResult.rows[0].role;

    // Check if target member exists
    const targetMembershipQuery = `
      SELECT role, left_at FROM channel_members
      WHERE channel_id = $1 AND user_id = $2
    `;
    const targetResult = await pool.query(targetMembershipQuery, [channelId, targetUserId]);

    if (targetResult.rows.length === 0 || targetResult.rows[0].left_at !== null) {
      return res.status(404).json({ error: "User is not an active member of this channel" });
    }

    // Authorization: User can remove themselves. Owners/Admins can remove standard members.
    const isSelfRemoval = callerId === targetUserId;
    const isPrivilegedRemoval = ["owner", "admin"].includes(callerRole) && targetUserId !== callerId;

    if (!isSelfRemoval && !isPrivilegedRemoval) {
      return res.status(403).json({ error: "Insufficient permissions to remove this member" });
    }

    // Soft delete membership
    const removeQuery = `
      UPDATE channel_members
      SET left_at = NOW(), removed_by = $3
      WHERE channel_id = $1 AND user_id = $2
    `;
    await pool.query(removeQuery, [channelId, targetUserId, callerId]);

    // Clean up unread states in Redis for this user in this channel
    await RedisService.resetUnread(targetUserId, channelId);

    return res.status(200).json({ message: "Member removed successfully" });
  } catch (error) {
    return handleChannelError(error, res);
  }
}

export async function getChannelPresenceHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.auth?.userId;
    const { id: channelId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify caller is active member
    await ChannelService.assertChannelMembership(channelId, userId);

    // Get all active member IDs
    const memberIds = await ChannelService.getActiveMemberIds(channelId);

    // Fetch presence of each member from Redis
    const presencePromises = memberIds.map(async (memberId) => {
      const presence = await RedisService.getPresence(memberId);
      
      // If we don't have presence, treat them as offline
      return {
        userId: memberId,
        status: presence?.status || "offline",
        lastSeenAt: presence?.lastSeenAt || null,
        platform: presence?.platform || null,
      };
    });

    const presences = await Promise.all(presencePromises);

    const online_members: any[] = [];
    const away_members: any[] = [];
    const offline_members: any[] = [];

    for (const p of presences) {
      if (p.status === "online") {
        online_members.push(p);
      } else if (p.status === "away") {
        away_members.push(p);
      } else {
        offline_members.push(p);
      }
    }

    return res.status(200).json({
      online_members,
      away_members,
      offline_members,
    });
  } catch (error) {
    return handleChannelError(error, res);
  }
}
