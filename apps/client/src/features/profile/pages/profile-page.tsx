import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import * as authApi from "../../../lib/api/auth";

type ProfileRecord = Record<string, unknown>;

type SectionId = "profile" | "account" | "privacy" | "chats" | "notifications";

type SectionItem = {
  id: SectionId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

type ScreenKind = "mobile" | "desktop";

const TOKEN_KEYS = ["accessToken", "refreshToken"] as const;

function getProfileString(
  profile: ProfileRecord,
  keys: string[],
  fallback = "",
) {
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function buildAvatarLabel(name: string) {
  const label = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return label || "U";
}

function useScreenKind() {
  const [screenKind, setScreenKind] = useState<ScreenKind>(() => {
    if (typeof window === "undefined") {
      return "desktop";
    }

    return window.matchMedia("(min-width: 768px)").matches
      ? "desktop"
      : "mobile";
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateScreenKind = () => {
      setScreenKind(mediaQuery.matches ? "desktop" : "mobile");
    };

    updateScreenKind();
    mediaQuery.addEventListener("change", updateScreenKind);

    return () => mediaQuery.removeEventListener("change", updateScreenKind);
  }, []);

  return screenKind;
}

const settingsItems: SectionItem[] = [
  {
    id: "profile",
    title: "Profile",
    subtitle: "Name, profile photo",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.9-4 4.9-6 8-6s6.1 2 8 6" />
      </svg>
    ),
  },
  {
    id: "account",
    title: "Account",
    subtitle: "Security notifications, account info",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 11h16" />
        <path d="M6.5 7.5a7 7 0 0 1 11 0" />
        <path d="M7 11v4" />
        <path d="M17 11v4" />
        <path d="M3.5 15.5h17" />
      </svg>
    ),
  },
  {
    id: "privacy",
    title: "Privacy",
    subtitle: "Blocked contacts, disappearing messages",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z" />
        <path d="M12 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
      </svg>
    ),
  },
  {
    id: "chats",
    title: "Chats",
    subtitle: "Theme, wallpaper, chat settings",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M7 9h10" />
        <path d="M7 12h7" />
      </svg>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    subtitle: "Messages, groups, sounds",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 17H9a3 3 0 0 1-3-3V9a6 6 0 1 1 12 0v5a3 3 0 0 1-3 3Z" />
        <path d="M10 18a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
];

function getSectionById(sectionId?: string) {
  return (
    settingsItems.find((item) => item.id === sectionId) ?? settingsItems[0]
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const params = useParams();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const screenKind = useScreenKind();

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const accessToken = window.localStorage.getItem("accessToken");

      if (!accessToken) {
        toast.error("Please sign in to continue");
        navigate("/auth/login", { replace: true });
        return;
      }

      try {
        const result = await authApi.getProfile();

        if (isMounted) {
          setProfile(result.user);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load profile";
        toast.error(message);
        navigate("/auth/login", { replace: true });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleLogout = () => {
    for (const key of TOKEN_KEYS) {
      window.localStorage.removeItem(key);
    }

    toast.success("Logged out");
    navigate("/auth/login", { replace: true });
  };

  const userName = getProfileString(
    profile ?? {},
    ["displayName", "display_name", "name"],
    "Your account",
  );
  const userEmail = getProfileString(profile ?? {}, ["email"], "Not available");
  const avatarLabel = buildAvatarLabel(userName);
  const selectedSection = getSectionById(params.sectionId);
  const [activeSection, setActiveSection] =
    useState<SectionItem>(selectedSection);

  useEffect(() => {
    setActiveSection(selectedSection);
  }, [selectedSection]);

  const handleSectionClick = (section: SectionItem) => {
    if (screenKind === "mobile") {
      navigate(`/profile/${section.id}`);
      return;
    }

    setActiveSection(section);
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#111111] px-3 py-4 text-zinc-50 sm:px-4 sm:py-5">
        <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 animate-pulse rounded-full border border-white/10 bg-white/10" />
            <p className="text-sm text-zinc-400">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-auto w-108 bg-[#111111] px-3 py-4 text-zinc-50 sm:px-4 sm:py-5">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex w-full max-w-md flex-col gap-6 lg:max-w-md">
          <header className="space-y-5 pt-1">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-white/8 bg-white/10 px-4 py-3 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                <span className="text-[1.03rem] text-zinc-400">
                  Search profile settings
                </span>
              </div>
            </div>
          </header>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
