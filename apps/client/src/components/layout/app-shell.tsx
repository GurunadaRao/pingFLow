import { Outlet } from "react-router-dom";
import SidebarNav from "../../../components/ui/sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#111111] text-zinc-50">
      <aside className="sticky top-0 h-screen shrink-0">
        <SidebarNav />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
