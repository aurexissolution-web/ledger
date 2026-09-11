import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { BriefcaseBusiness, FileBarChart, LayoutDashboard, Leaf, LogOut, PanelLeft, Settings as SettingsIcon } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { SignIn, roleLabel } from "./SignIn";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: BriefcaseBusiness, label: "Subcon", path: "/subcon", adminOnly: true },
  { icon: Leaf, label: "Chili", path: "/chili" },
  { icon: FileBarChart, label: "Reports", path: "/reports" },
  { icon: SettingsIcon, label: "Settings", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return <SignIn />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const visibleMenuItems = menuItems.filter(item => !item.adminOnly || user?.role === "admin");
  const activeMenuItem = visibleMenuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative print:hidden" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[#e0ddd2] [&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,#f6f4ed_0%,#efeee6_100%)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-[88px] justify-center border-b border-[#e3e0d5]">
            <div className="flex items-center gap-3 px-3 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-[#e6e6dc] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-[linear-gradient(150deg,#2d4938,#1a2b21)] text-[#fffdfa] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_20px_-10px_rgba(34,55,44,0.7)] ring-1 ring-white/10"><span className="font-serif text-base leading-none">K</span></div>
                  <div className="min-w-0"><span className="block truncate font-bold tracking-[-0.03em] text-[#20352a]">Keluarga Ledger</span><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a917f]">Business records</p></div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {!isCollapsed ? <p className="px-6 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa094]">Navigation</p> : null}
            <SidebarMenu className={`px-3 pb-5 ${isCollapsed ? "pt-5" : "pt-2"} gap-1`}>
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`relative h-11 rounded-xl px-3 font-semibold tracking-[-0.01em] transition-all duration-200 ${isActive ? "border border-[#e3dfd2] bg-[#fffefa] text-[#22372c] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(38,52,42,0.05),0_10px_22px_-14px_rgba(38,52,42,0.35)] hover:bg-[#fffefa] data-[active=true]:bg-[#fffefa]" : "text-[#4f5f55] hover:translate-x-[2px] hover:bg-[#e9eadf] hover:text-[#22372c]"}`}
                    >
                      {isActive ? <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[linear-gradient(180deg,#4d6b55,#22372c)] group-data-[collapsible=icon]:hidden" /> : null}
                      <item.icon
                        className={`h-4 w-4 transition-colors ${isActive ? "text-[#22372c]" : "text-[#6b7a70]"}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-[#e3e0d5] p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-all hover:border-[#e3dfd2] hover:bg-[#fffefa] hover:shadow-[0_8px_18px_-14px_rgba(38,52,42,0.35)] group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 shrink-0 ring-1 ring-[#d4d9cf] ring-offset-1 ring-offset-[#f3f1e8]">
                    <AvatarFallback className="bg-[linear-gradient(180deg,#e6ece0,#d8e1d2)] text-xs font-bold text-[#314a3a]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || (user ? roleLabel(user.role) : "")}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#e3e0d5] bg-[#f6f4ed]/85 px-3 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md print:hidden">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg border border-[#e3dfd2] bg-[#fffefa] shadow-sm" />
              <div className="flex items-center gap-2.5">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(150deg,#2d4938,#1a2b21)] text-[#fffdfa]"><span className="font-serif text-xs leading-none">K</span></div>
                <span className="font-semibold tracking-tight text-foreground">
                  {activeMenuItem?.label ?? "Menu"}
                </span>
              </div>
            </div>
          </div>
        )}
          <main className="app-canvas flex-1 p-4 sm:p-6 lg:p-8 print:p-0">{children}</main>
      </SidebarInset>
    </>
  );
}
