import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import * as authApi from "../lib/api/auth";

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
  export { default } from "../features/profile/pages/profile-page";
  export { default as ProfilePage } from "../features/profile/pages/profile-page";
                      isActive ? "bg-white/5" : ""
                    }`}
                  >
                    <span className="flex w-10 shrink-0 justify-center text-zinc-400">
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[1.02rem] font-medium text-white">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[0.95rem] leading-5 text-zinc-400">
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
