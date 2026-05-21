import pool from "../lib/pg";

export class ChannelService {
  static async assertChannelMembership(
    channelId: string,
    userId: string,
  ): Promise<void> {
    const query = `
      SELECT 1
      FROM channels c
      JOIN channel_members cm ON c.id = cm.channel_id
      WHERE c.id = $1
        AND cm.user_id = $2
        AND cm.left_at IS NULL
        AND c.deleted_at IS NULL
      LIMIT 1
    `;

    const result = await pool.query(query, [channelId, userId]);
    if (result.rowCount === 0) {
      throw new Error("User is not a member of this channel");
    }
  }

  static async getActiveMemberIds(channelId: string): Promise<string[]> {
    const query = `
      SELECT user_id
      FROM channel_members
      WHERE channel_id = $1
        AND left_at IS NULL
    `;
    const result = await pool.query(query, [channelId]);
    return result.rows.map((row) => row.user_id);
  }
}
