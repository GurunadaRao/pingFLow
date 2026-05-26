import { cn } from "../../lib/utils";
import { NavLink } from "react-router-dom";
import chatIcon from "../../src/assets/sidebar/mesage.png";
import statusIcon from "../../src/assets/sidebar/updates.png";
import communityIcon from "../../src/assets/sidebar/group.png";
import profileIcon from "../../src/assets/sidebar/user.png";

export function SidebarNav() {
  const topItems = [
    { to: "/chat", img: chatIcon, label: "Chat" },
    { to: "/status", img: statusIcon, label: "Status" },
    { to: "/communities", img: communityIcon, label: "Communities" },
  ];

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-black/10 bg-[#a8a8a8]",
        "w-[10vw]",
      )}
      style={{ minWidth: "120px", maxWidth: "200px" }}
    >
      <div className="border-b border-black/10 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/55">
          PingFlow
        </p>
        <h1 className="mt-2 text-lg font-semibold text-black/80">Workspace</h1>
      </div>

      {/* Top Navigation */}
      <nav className="flex flex-1 flex-col gap-3 px-3 py-4">
        {topItems.map((item) => {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 transition-all",
                  isActive
                    ? "bg-[#969090] text-white"
                    : "text-gray-700 hover:bg-white/50",
                )
              }
            >
              <img src={item.img} alt={item.label} className="h-5 w-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Profile */}
      <div className="border-t border-black/10 p-3">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-2xl px-3 py-3 transition-all",
              isActive
                ? "bg-[#969090] text-white"
                : "text-gray-700 hover:bg-white/50",
            )
          }
        >
          <img src={profileIcon} alt="Profile" className="h-5 w-5" />
          <span className="text-sm font-medium">Profile</span>
        </NavLink>
      </div>
    </aside>
  );
}

export default SidebarNav;
