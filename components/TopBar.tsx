"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, Building2, CalendarDays, Check, ChevronDown, LogOut, MapPin, Search, Settings, Shield, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";
import { useSubscriptionAccess } from "@/components/SubscriptionProvider";

interface TopBarProps { title: string; subtitle?: string; searchPlaceholder?: string; }
interface Branch { id: string; name: string; is_main?: boolean; }
interface Notif  {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  type?: string;
  severity?: "info" | "warning" | "critical" | null;
  action_url?: string | null;
}

let currentTopBarNow = Date.now();
const topBarNowListeners = new Set<() => void>();
let topBarNowIntervalId: number | null = null;

function subscribeTopBarNow(listener: () => void) {
  topBarNowListeners.add(listener);

  if (topBarNowIntervalId === null && typeof window !== "undefined") {
    topBarNowIntervalId = window.setInterval(() => {
      currentTopBarNow = Date.now();
      topBarNowListeners.forEach((notify) => notify());
    }, 60_000);
  }

  return () => {
    topBarNowListeners.delete(listener);

    if (topBarNowListeners.size === 0 && topBarNowIntervalId !== null) {
      window.clearInterval(topBarNowIntervalId);
      topBarNowIntervalId = null;
    }
  };
}

export default function TopBar({ title, subtitle, searchPlaceholder = "Search..." }: TopBarProps) {
  const router = useRouter();
  const { hasFeature } = useSubscriptionAccess();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const now = useSyncExternalStore(
    subscribeTopBarNow,
    () => currentTopBarNow,
    () => 0
  );

  // ── User info ──────────────────────────────────────────────────────────────
  const [userInfo, setUserInfo] = useState({ username:"User", displayName:"User", role:"User", initials:"U", userId:"" });

  // ── Date picker ────────────────────────────────────────────────────────────
  const [dateOpen,      setDateOpen]      = useState(false);
  const [selectedDate,  setSelectedDate]  = useState<Date>(() => new Date());
  const [calYear,       setCalYear]       = useState(() => new Date().getFullYear());
  const [calMonth,      setCalMonth]      = useState(() => new Date().getMonth());
  const dateRef = useRef<HTMLDivElement>(null);

  const selectDate = (d: Date) => {
    setSelectedDate(d);
    setDateOpen(false);
    window.dispatchEvent(new CustomEvent("date-changed", { detail: d }));
  };

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_LABELS  = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const formatSelected = (d: Date) => d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  // ── Branch ─────────────────────────────────────────────────────────────────
  const [branches,      setBranches]      = useState<Branch[]>([]);
  const [activeBranch,  setActiveBranch]  = useState<Branch>({ id:"", name:"Main Branch" });
  const [branchOpen,    setBranchOpen]    = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchVal,   setSearchVal]   = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [notifs,      setNotifs]      = useState<Notif[]>([]);
  const [unread,      setUnread]      = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── User menu ──────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Load user info ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const load = async (authUser: { id: string; email?: string } | null | undefined) => {
      if (!authUser) return;
      const { data: prof } = await supabase.from("users")
        .select("id,first_name,last_name,username,email,role_id,branch_id")
        .eq("auth_id", authUser.id).maybeSingle();
      const profileUser = prof as { id?:string; first_name?:string; last_name?:string; username?:string; email?:string; role_id?:string; branch_id?:string } | null;
      const { data: roleRow } = profileUser?.role_id
        ? await supabase.from("roles").select("name").eq("id", profileUser.role_id).maybeSingle()
        : { data: null };
      const resolved = resolveCurrentUserInfo({ authUser, profileUser, roleName:(roleRow as {name?:string}|null)?.name??null });
      if (!mounted) return;
      setUserInfo({ ...resolved, userId: profileUser?.id ?? "" });

      // Branches
      const { data: blist } = await supabase.from("branches").select("id,name,is_main").eq("is_active", true).order("name");
      if (!mounted) return;
      const branches = (blist ?? []) as Branch[];
      setBranches(branches);
      const saved = localStorage.getItem("active_branch_id");
      const found = branches.find(b => b.id === saved) ?? branches.find(b => b.is_main) ?? branches[0];
      if (found) setActiveBranch(found);

      const { data: notificationRows } = await supabase
        .from("notifications")
        .select("id,title,message,created_at,is_read,notification_type,severity,action_url")
        .order("created_at", { ascending: false })
        .limit(12);
      if (!mounted) return;

      const mapped: Notif[] = (notificationRows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        title: String(row.title ?? "Notification"),
        message: String(row.message ?? ""),
        created_at: String(row.created_at),
        is_read: Boolean(row.is_read),
        type: String(row.notification_type ?? "info"),
        severity: (row.severity as Notif["severity"]) ?? "info",
        action_url: typeof row.action_url === "string" ? row.action_url : null,
      }));
      setNotifs(mapped);
      setUnread(mapped.filter((n) => !n.is_read).length);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => { void load(session?.user); });
    void supabase.auth.getUser().then(({ data }) => load(data.user));
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // ── Click outside ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!branchRef.current?.contains(e.target as Node)) setBranchOpen(false);
      if (!notifRef.current?.contains(e.target as Node))  setNotifOpen(false);
      if (!menuRef.current?.contains(e.target as Node))   setMenuOpen(false);
      if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false);
      if (!dateRef.current?.contains(e.target as Node))   setDateOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Keyboard shortcut Ctrl/Cmd+K ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault(); setSearchOpen(true);
        setTimeout(() => searchInput.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setSearchVal(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Branch switch ──────────────────────────────────────────────────────────
  const switchBranch = (b: Branch) => {
    setActiveBranch(b);
    localStorage.setItem("active_branch_id", b.id);
    setBranchOpen(false);
    window.dispatchEvent(new CustomEvent("branch-changed", { detail: b }));
  };

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllRead = () => {
    void supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);

    setNotifs(n => n.map(x => ({ ...x, is_read: true })));
    setUnread(0);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.replace("/");
  };

  // ── Time ago ──────────────────────────────────────────────────────────────
  const timeAgo = (iso: string) => {
    const diff = Math.floor((now - new Date(iso).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  };

  return (
    <>
      <header className="topbar">
        {/* Left — title */}
        <div className="topbar__left">
          <h1 className="topbar__title">{title}</h1>
          {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
        </div>

        {/* Right — controls */}
        <div className="topbar__right">

        {/* Date picker */}
          <div className="topbar__date-wrap" ref={dateRef}>
            <button className="topbar__branch" style={{gap:8}} onClick={() => setDateOpen(v=>!v)}>
              <CalendarDays size={13}/>
              <span suppressHydrationWarning>{mounted ? formatSelected(selectedDate) : ""}</span>
              <ChevronDown size={12}/>
            </button>

            {dateOpen && (
              <div className="topbar__dropdown topbar__datepicker" style={{minWidth:280,right:0}}>
                {/* Presets */}
                <div className="topbar__date-presets">
                  {[{label:"Today",fn:()=>selectDate(new Date())},
                    {label:"Yesterday",fn:()=>{const d=new Date();d.setDate(d.getDate()-1);selectDate(d);}},
                    {label:"This Week",fn:()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());selectDate(d);}},
                    {label:"This Month",fn:()=>selectDate(new Date(new Date().getFullYear(),new Date().getMonth(),1))},
                  ].map(p=>(
                    <button key={p.label} className="topbar__date-preset" onClick={p.fn}>{p.label}</button>
                  ))}
                </div>

                {/* Month nav */}
                <div className="topbar__cal-nav">
                  <button className="topbar__cal-arrow" onClick={prevMonth}>‹</button>
                  <span className="topbar__cal-month">{MONTH_NAMES[calMonth]} {calYear}</span>
                  <button className="topbar__cal-arrow" onClick={nextMonth}>›</button>
                </div>

                {/* Day labels */}
                <div className="topbar__cal-grid">
                  {DAY_LABELS.map(d=><div key={d} className="topbar__cal-day-label">{d}</div>)}
                  {/* Empty cells */}
                  {Array.from({length:firstDayOfMonth(calYear,calMonth)}).map((_,i)=><div key={`e${i}`}/>)}
                  {/* Day cells */}
                  {Array.from({length:daysInMonth(calYear,calMonth)}).map((_,i)=>{
                    const day = i+1;
                    const thisDate = new Date(calYear,calMonth,day);
                    const isSelected = selectedDate.getFullYear()===calYear && selectedDate.getMonth()===calMonth && selectedDate.getDate()===day;
                    const isToday = new Date().getFullYear()===calYear && new Date().getMonth()===calMonth && new Date().getDate()===day;
                    return (
                      <button key={day}
                        className={`topbar__cal-day ${isSelected?"topbar__cal-day--selected":""} ${isToday&&!isSelected?"topbar__cal-day--today":""}`}
                        onClick={()=>selectDate(thisDate)}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Branch selector */}
          <div className="topbar__branch-wrap" ref={branchRef}>
            <button className="topbar__branch" onClick={() => setBranchOpen(v => !v)}>
              <MapPin size={13}/><span>{activeBranch.name}</span><ChevronDown size={12}/>
            </button>
            {branchOpen && (
              <div className="topbar__dropdown topbar__dropdown--branch">
                <div className="topbar__dropdown-header">Switch Branch</div>
                {branches.length === 0 && <div className="topbar__dropdown-empty">No branches found</div>}
                {branches.map(b => (
                  <button key={b.id} className={`topbar__dropdown-item ${b.id===activeBranch.id?"topbar__dropdown-item--active":""}`}
                    onClick={() => switchBranch(b)}>
                    <Building2 size={13}/>
                    <span>{b.name}</span>
                    {b.id===activeBranch.id && <Check size={13} className="topbar__dropdown-check"/>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search trigger */}
          <button className="topbar__search" onClick={() => { setSearchOpen(true); setTimeout(()=>searchInput.current?.focus(),50); }}>
            <Search size={14}/><span>{searchPlaceholder}</span>
            <kbd className="topbar__kbd">Ctrl K</kbd>
          </button>

          {/* Notification bell */}
          <div className="topbar__notif-wrap" ref={notifRef}>
            <button className="topbar__notif" onClick={() => { setNotifOpen(v=>!v); setUnread(0); markAllRead(); }} aria-label="Notifications">
              <Bell size={17}/>
              {unread > 0 && <span className="topbar__badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {notifOpen && (
              <div className="topbar__dropdown topbar__dropdown--notif">
                <div className="topbar__dropdown-header">
                  <span>Notifications</span>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <button className="topbar__notif-clear" onClick={markAllRead}>Mark all read</button>
                    <button className="topbar__notif-clear" onClick={() => { router.push("/notifications"); setNotifOpen(false); }}>View all</button>
                  </div>
                </div>
                {notifs.length === 0 && <div className="topbar__dropdown-empty">No notifications</div>}
                {notifs.map(n => (
                  <div key={n.id} className={`topbar__notif-item ${n.severity==="critical"?"topbar__notif-item--warn":""}`}>
                    <div className="topbar__notif-dot" style={{background:n.severity==="critical"?"#dc2626":n.severity==="warning"?"#f59e0b":"#3b82f6"}}/>
                    <div className="topbar__notif-body">
                      <div className="topbar__notif-msg"><strong>{n.title}</strong>{n.message ? ` - ${n.message}` : ""}</div>
                      <div className="topbar__notif-time">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="topbar__user-wrapper" ref={menuRef}>
            <button className="topbar__user" onClick={()=>setMenuOpen(v=>!v)}>
              <div className="topbar__avatar">{userInfo.initials}</div>
              <div className="topbar__user-copy">
                <span className="topbar__user-name">{userInfo.username}</span>
                <span className="topbar__user-role">{userInfo.role}</span>
              </div>
              <ChevronDown size={12} className={`topbar__chevron ${menuOpen?"topbar__chevron--open":""}`}/>
            </button>
            {menuOpen && (
              <div className="topbar__menu" role="menu">
                <div className="topbar__menu-header">
                  <div className="topbar__menu-avatar">{userInfo.initials}</div>
                  <div className="topbar__menu-info">
                    <div className="topbar__menu-username">{userInfo.username}</div>
                    <div className="topbar__menu-role">{userInfo.role}</div>
                  </div>
                </div>
                <div className="topbar__menu-divider"/>
                <button className="topbar__menu-item" onClick={() => { router.push("/settings"); setMenuOpen(false); }}>
                  <Settings size={15}/><span>Settings</span>
                </button>
                <button className="topbar__menu-item" onClick={() => { router.push("/subscription"); setMenuOpen(false); }}>
                  <Building2 size={15}/><span>Subscription</span>
                </button>
                <button className="topbar__menu-item" onClick={() => { router.push("/security"); setMenuOpen(false); }}>
                  <Shield size={15}/><span>Security Center</span>
                </button>
                {hasFeature("audit_logs") ? (
                  <button className="topbar__menu-item" onClick={() => { router.push("/audit-logs"); setMenuOpen(false); }}>
                    <Shield size={15}/><span>Audit Logs</span>
                  </button>
                ) : null}
                <button className="topbar__menu-item" onClick={() => { router.push("/users-roles"); setMenuOpen(false); }}>
                  <User size={15}/><span>Manage Users</span>
                </button>
                <div className="topbar__menu-divider"/>
                <button className="topbar__menu-item topbar__menu-item--danger" onClick={handleLogout}>
                  <LogOut size={15}/><span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global search overlay */}
      {searchOpen && (
        <div className="topbar__search-overlay" ref={searchRef}>
          <div className="topbar__search-modal">
            <div className="topbar__search-input-wrap">
              <Search size={16} style={{color:"#64748b",flexShrink:0}}/>
              <input
                ref={searchInput}
                className="topbar__search-input"
                placeholder={searchPlaceholder}
                value={searchVal}
                onChange={e=>setSearchVal(e.target.value)}
                autoFocus
              />
              {searchVal && <button className="topbar__search-x" onClick={()=>setSearchVal("")}><X size={14}/></button>}
              <kbd className="topbar__kbd" style={{marginLeft:4}}>ESC</kbd>
            </div>
            {searchVal.trim().length > 0 ? (
              <div className="topbar__search-results">
                <div className="topbar__search-hint">Press Enter to search for &ldquo;{searchVal}&rdquo; across all modules</div>
              </div>
            ) : (
              <div className="topbar__search-results">
                <div className="topbar__search-hint">Start typing to search products, customers, suppliers, invoices…</div>
                <div className="topbar__search-shortcuts">
                  {[["Dashboard","/dashboard"],["POS / Sales","/pos"],["Inventory","/inventory"],["Reports","/reports"],["Settings","/settings"]].map(([label, href])=>(
                    <button key={href} className="topbar__search-shortcut" onClick={()=>{ router.push(href); setSearchOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="topbar__search-backdrop" onClick={()=>{ setSearchOpen(false); setSearchVal(""); }}/>
        </div>
      )}
    </>
  );
}
