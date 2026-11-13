import { SatisfactionTab } from "./AdminSatisfaction";
import { AiBillingTab } from "./AiBillingTab";
import { MarketingTab } from "./MarketingTab";
import "./admin.css";
import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users, Brain, CreditCard, Activity, Flag, LayoutTemplate, Shield, Server, BarChart2, AlertCircle, HeartCrack, DollarSign, SlidersHorizontal, Package, ListChecks, Bot, ScrollText, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OverviewTab, SystemHealthTab, ApiUsageTab } from "./AdminOverview";
import { ChecklistTab } from "./AdminChecklist";
import { UsersTab } from "./AdminUsers";
import { SessionsTab } from "./AdminSessions";
import { TransactionsTab } from "./AdminTransactions";
import { CreditPacksTab } from "./AdminCreditPacks";
import { LimitsTab } from "./AdminLimits";
import { TemplatesTab } from "./AdminTemplates";
import { ErrorLogsTab, FeedbackFlagsTab } from "./AdminLogs";
import { AiStudioTab } from "./AdminModels";
import { PricingTab } from "./AdminPricing";
import { SeatOrdersTab } from "./AdminSeats";
import { EmailsTab } from "./AdminEmails";

type AdminTab =
  | "satisfaction" | "overview" | "health" | "users" | "sessions" | "transactions" | "limits"
  | "api-usage" | "errors" | "abuse" | "marketing" | "templates" | "pricing" | "credit-packs" | "api-keys"
  | "ai-billing" | "checklist" | "ai-studio" | "seat-orders" | "emails";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",       icon: Activity },
  { id: "checklist",    label: "Setup Checklist", icon: ListChecks },
  { id: "health",       label: "System Health",  icon: Server },
  { id: "ai-studio",    label: "AI Studio",      icon: Bot },
  { id: "seat-orders",  label: "Seat Orders",    icon: ScrollText },
  { id: "ai-billing", label: "AI Billing", icon: DollarSign },
  { id: "pricing",      label: "Pricing",        icon: DollarSign },
  { id: "api-keys",     label: "API Keys",       icon: Shield },
  { id: "users",        label: "Users",           icon: Users },
  { id: "sessions",     label: "Sessions",        icon: Brain },
  { id: "transactions", label: "Transactions",    icon: CreditCard },
  { id: "api-usage",    label: "API Usage",       icon: BarChart2 },
  { id: "errors",       label: "Error Logs",      icon: AlertCircle },
  { id: "satisfaction", label: "Satisfaction Score", icon: BarChart2 },
  { id: "abuse",        label: "Feedback Flags",     icon: HeartCrack },
  { id: "credit-packs", label: "Credit Packs",    icon: Package },
  { id: "limits",       label: "Limits & Defaults",          icon: SlidersHorizontal },
  { id: "marketing",    label: "Marketing",   icon: Flag },
  { id: "templates",    label: "Templates",       icon: LayoutTemplate },
  { id: "emails",       label: "Emails",          icon: Mail },
];

function ApiKeysTab() {
  return <section className="lgt-card lgt-card--compact space-y-3">
    <h3 className="text-sm font-semibold">Provider keys</h3>
    <p>Litigant AI uses the provider keys saved in Fluba. Manage keys and check their connections there.</p>
    <Button asChild variant="outline"><a href="https://flubadesigns.com/admin/cortex" target="_blank" rel="noopener noreferrer">Open Fluba Cortex</a></Button>
  </section>;
}

export default function AdminPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const requestedTab = new URLSearchParams(search).get("tab");
  const tabFromUrl = (requestedTab === "flags" ? "marketing" : requestedTab) as AdminTab | null;
  const validTab = tabFromUrl && TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "overview";
  const [activeTab, setActiveTabState] = useState<AdminTab>(validTab);
  const mobileNav = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = mobileNav.current;
    const button = nav?.querySelector<HTMLElement>(`[data-admin-tab="${activeTab}"]`);
    if (nav && button) nav.scrollTo({left: button.offsetLeft - (nav.clientWidth - button.clientWidth) / 2});
  }, [activeTab]);

  useEffect(() => {
    setActiveTabState(validTab);
  }, [validTab]);

  function setActiveTab(tab: AdminTab) {
    setActiveTabState(tab);
    setLocation(`/admin?tab=${tab}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div className="admin-page min-w-0 bg-background text-foreground flex flex-col">
      <div className="flex flex-1">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-border bg-card/40 py-6 px-3 gap-1">
        <div className="flex items-center gap-2 px-3 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">Admin</span>
        </div>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full",
              activeTab === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </aside>

      {/* The same page list powers the desktop sidebar and scrolling phone buttons. */}
      <nav ref={mobileNav} aria-label="Admin navigation" className="admin-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card flex overflow-x-auto">
        {TABS.map(({id, label, icon: Icon}) => (
          <button key={id} data-admin-tab={id} aria-current={activeTab === id ? "page" : undefined}
            onClick={() => setActiveTab(id)}
            className={cn("flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs min-w-[84px] shrink-0 transition-colors", activeTab === id ? "text-primary" : "text-muted-foreground")}>
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-28 lg:pb-8 max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-xl font-bold">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h1>
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview"     && <OverviewTab />}
          {activeTab === "checklist"    && <ChecklistTab />}
          {activeTab === "health"       && <SystemHealthTab />}
          {activeTab === "ai-studio"    && <AiStudioTab />}
          {activeTab === "seat-orders"  && <SeatOrdersTab />}
          {activeTab === "pricing"      && <PricingTab />}
          {activeTab === "api-keys"     && <ApiKeysTab />}
          {activeTab === "users"        && <UsersTab />}
          {activeTab === "sessions"     && <SessionsTab />}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "api-usage"    && <ApiUsageTab />}
          {activeTab === "errors"       && <ErrorLogsTab />}
          {activeTab === "satisfaction" && <SatisfactionTab />}
          {activeTab === "abuse"        && <FeedbackFlagsTab />}
          {activeTab === "credit-packs" && <CreditPacksTab />}
          {activeTab === "limits"       && <LimitsTab />}
          {activeTab === "marketing"    && <MarketingTab />}
          {activeTab === "ai-billing" && <AiBillingTab />}
          {activeTab === "templates"    && <TemplatesTab />}
          {activeTab === "emails"       && <EmailsTab />}
        </motion.div>
      </div>
    </div>
  </div>
  );
}
