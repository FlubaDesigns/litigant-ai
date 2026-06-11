import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, CreditCard, History, TrendingUp, AlertTriangle,
  CheckCircle2, Crown, Package, RefreshCw, ExternalLink,
  ArrowUpRight, ArrowDownRight, Sparkles, Info, ChevronDown,
  RotateCcw, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  getProducts,
  getTransactions,
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  type BillingProduct,
  type CreditTransaction,
  type StripeSubscription,
} from "@/services/billingService";

const CREDIT_PACKS_LABELS: Record<string, { credits: number; badge?: string }> = {
  "Starter Pack": { credits: 100 },
  "Pro Pack": { credits: 500, badge: "Popular" },
  "Mega Pack": { credits: 1000, badge: "Best Value" },
};

const TX_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  purchase: CreditCard,
  subscription_grant: Crown,
  signup_bonus: Sparkles,
  usage: ArrowDownRight,
  refund: RotateCcw,
  admin_adjustment: RefreshCw,
};

const TX_COLORS: Record<string, string> = {
  purchase: "text-green-400",
  subscription_grant: "text-violet-400",
  signup_bonus: "text-primary",
  usage: "text-red-400",
  refund: "text-blue-400",
  admin_adjustment: "text-amber-400",
};

const TX_LABELS: Record<string, string> = {
  purchase: "Credit Purchase",
  subscription_grant: "Subscription Credits",
  signup_bonus: "Welcome Bonus",
  usage: "Session Usage",
  refund: "Refund",
  admin_adjustment: "Adjustment",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(cents: number | null): string {
  if (cents === null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function CreditBalanceCard({ balance, plan }: { balance: number; plan: string }) {
  const isLow = balance < 50;
  const isCritical = balance < 10;

  return (
    <div
      className={cn(
        "rounded-2xl border p-6 relative overflow-hidden",
        isCritical
          ? "border-red-500/40 bg-red-500/5"
          : isLow
            ? "border-yellow-500/40 bg-yellow-500/5"
            : "border-primary/30 bg-primary/5"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-1">
              Credit Balance
            </p>
            <div className="flex items-end gap-2">
              <motion.span
                key={balance}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "text-5xl font-bold font-mono tabular-nums",
                  isCritical ? "text-red-400" : isLow ? "text-yellow-400" : "text-primary"
                )}
              >
                {balance.toLocaleString()}
              </motion.span>
              <span className="text-muted-foreground text-sm mb-1.5">credits</span>
            </div>
          </div>
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              isCritical
                ? "bg-red-500/15"
                : isLow
                  ? "bg-yellow-500/15"
                  : "bg-primary/15"
            )}
          >
            <Zap
              className={cn(
                "w-6 h-6",
                isCritical ? "text-red-400" : isLow ? "text-yellow-400" : "text-primary"
              )}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs capitalize",
              plan === "pro"
                ? "border-violet-500/40 text-violet-400 bg-violet-500/10"
                : "border-border/60 text-muted-foreground"
            )}
          >
            {plan === "pro" && <Crown className="w-3 h-3 mr-1" />}
            {plan} Plan
          </Badge>
          {isCritical && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Critical — top up now
            </span>
          )}
          {!isCritical && isLow && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Running low
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onBuy,
  loading,
  isSubscription,
  currentPlan,
}: {
  product: BillingProduct;
  onBuy: (priceId: string) => void;
  loading: boolean;
  isSubscription: boolean;
  currentPlan: string;
}) {
  const price = product.prices[0];
  const credits = parseInt(product.metadata?.creditAmount ?? "0", 10);
  const label = CREDIT_PACKS_LABELS[product.name];
  const badge = label?.badge;
  const isCurrentPlan = isSubscription && currentPlan === "pro";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-xl border p-5 flex flex-col gap-4 transition-all duration-200",
        isSubscription
          ? "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/50"
          : badge === "Popular"
            ? "border-primary/40 bg-primary/5 hover:border-primary/60"
            : "border-border/60 bg-card/50 hover:border-border"
      )}
    >
      {badge && (
        <div className="absolute -top-2.5 left-4">
          <Badge
            className={cn(
              "text-xs",
              badge === "Best Value"
                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                : "bg-primary/20 text-primary border-primary/30"
            )}
            variant="outline"
          >
            {badge}
          </Badge>
        </div>
      )}
      {isSubscription && (
        <div className="absolute -top-2.5 left-4">
          <Badge
            className="text-xs bg-violet-500/20 text-violet-400 border-violet-500/30"
            variant="outline"
          >
            <Crown className="w-3 h-3 mr-1" />
            Subscription
          </Badge>
        </div>
      )}

      <div className="mt-1">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-sm">{product.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-lg font-bold tabular-nums">
              {formatCurrency(price?.unit_amount ?? null)}
            </div>
            {price?.recurring && (
              <div className="text-xs text-muted-foreground">/{price.recurring.interval}</div>
            )}
          </div>
        </div>
      </div>

      {credits > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-primary font-mono font-semibold">
            {credits.toLocaleString()} credits
          </span>
          {isSubscription && (
            <span className="text-muted-foreground">per month</span>
          )}
        </div>
      )}

      <Button
        size="sm"
        disabled={loading || isCurrentPlan || !price?.id}
        onClick={() => price?.id && onBuy(price.id)}
        className={cn(
          "w-full mt-auto",
          isSubscription
            ? "bg-violet-600 hover:bg-violet-500 text-white"
            : "bg-primary hover:bg-primary/90 text-primary-foreground"
        )}
      >
        {loading ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : isCurrentPlan ? (
          <>
            <CheckCircle2 className="w-3 h-3 mr-1.5" />
            Current Plan
          </>
        ) : isSubscription ? (
          <>
            <Crown className="w-3 h-3 mr-1.5" />
            Upgrade to Pro
          </>
        ) : (
          <>
            <Package className="w-3 h-3 mr-1.5" />
            Buy Credits
          </>
        )}
      </Button>
    </motion.div>
  );
}

function TransactionRow({ tx }: { tx: CreditTransaction }) {
  const Icon = TX_ICONS[tx.type] ?? CreditCard;
  const color = TX_COLORS[tx.type] ?? "text-muted-foreground";
  const label = TX_LABELS[tx.type] ?? tx.type;
  const isCredit = tx.amount > 0;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-muted/30 shrink-0", color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{label}</span>
          {tx.sessionId && (
            <span className="text-xs text-muted-foreground font-mono truncate">
              #{tx.sessionId.slice(-6)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-sm font-mono font-semibold tabular-nums",
            isCredit ? "text-green-400" : "text-red-400"
          )}
        >
          {isCredit ? "+" : ""}{tx.amount.toLocaleString()}
        </div>
        {tx.balanceAfter !== undefined && (
          <div className="text-xs text-muted-foreground tabular-nums">
            bal: {tx.balanceAfter.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { user, userProfile, firebaseReady } = useAuth();
  const [, navigate] = useLocation();

  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txNextCursor, setTxNextCursor] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<StripeSubscription | null>(null);
  const [autoRefill, setAutoRefill] = useState(false);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [loadingMoreTx, setLoadingMoreTx] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const [params] = useState(() => new URLSearchParams(window.location.search));
  const didSucceed = params.get("success") === "true";
  const didCancel = params.get("cancelled") === "true";

  useEffect(() => {
    if (didSucceed) toast.success("Payment successful! Credits will appear shortly.");
    if (didCancel) toast.info("Payment cancelled.");
  }, [didSucceed, didCancel]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    const data = await getProducts();
    setProducts(data);
    setLoadingProducts(false);
  }, []);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoadingTx(true);
    const result = await getTransactions();
    setTransactions(result.items);
    setTxNextCursor(result.nextCursor);
    setLoadingTx(false);
  }, [user]);

  const fetchSubscription = useCallback(async () => {
    if (!user) return;
    const sub = await getSubscription();
    setSubscription(sub);
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (user) {
      fetchTransactions();
      fetchSubscription();
    } else {
      setLoadingTx(false);
    }
  }, [user, fetchTransactions, fetchSubscription]);

  async function handleLoadMoreTx() {
    if (!txNextCursor) return;
    setLoadingMoreTx(true);
    const result = await getTransactions(txNextCursor);
    setTransactions((prev) => [...prev, ...result.items]);
    setTxNextCursor(result.nextCursor);
    setLoadingMoreTx(false);
  }

  async function handleBuy(priceId: string) {
    if (!user) {
      toast.error("Please sign in to purchase credits.");
      return;
    }
    if (priceId.startsWith("price_") && !priceId.startsWith("price_s") && priceId.length < 20) {
      toast.error("Stripe is not yet connected. Connect it via the Integrations tab to enable purchases.");
      return;
    }
    setCheckoutLoading(priceId);
    try {
      const url = await createCheckoutSession(priceId);
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Failed to create checkout session.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageSubscription() {
    if (!user) return;
    setPortalLoading(true);
    try {
      const url = await createPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        toast.error("No billing account found. Purchase a plan first.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  const balance = userProfile?.creditBalance ?? 0;
  const plan = userProfile?.plan ?? "free";
  const subscriptionStatus = userProfile?.subscriptionStatus ?? "none";
  const isProActive = plan === "pro" && subscriptionStatus === "active";

  const creditPacks = products.filter(
    (p) => p.metadata?.type === "credit_pack" || (!p.metadata?.type && !p.prices[0]?.recurring)
  );
  const subscriptionProducts = products.filter(
    (p) => p.metadata?.type === "subscription" || p.prices[0]?.recurring
  );

  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-2">Billing & Credits</h2>
          <p className="text-muted-foreground text-sm">
            Firebase is not configured. Sign in to manage your credits and subscription.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-2">Billing & Credits</h2>
          <p className="text-muted-foreground text-sm mb-4">Sign in to view your balance and purchase credits.</p>
          <Button onClick={() => navigate("/login")} className="bg-primary text-primary-foreground">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Billing & Credits</h1>
          <p className="text-muted-foreground text-sm">
            Manage your credit balance and subscription.
          </p>
        </div>

        {balance < 10 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">You're almost out of credits</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You need at least 10 credits to run a Brain Session. Top up below.
              </p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <CreditBalanceCard balance={balance} plan={plan} />

            {(isProActive || subscription) && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Crown className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold">Pro Subscription</span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        subscriptionStatus === "active"
                          ? "border-green-500/40 text-green-400"
                          : subscriptionStatus === "past_due"
                            ? "border-yellow-500/40 text-yellow-400"
                            : "border-border/60 text-muted-foreground"
                      )}
                    >
                      {subscriptionStatus}
                    </Badge>
                  </div>
                  {subscription?.current_period_end && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Renews</span>
                      <span>
                        {new Date(subscription.current_period_end * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {subscription?.cancel_at_period_end && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Cancels at period end
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="w-full text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  {portalLoading ? (
                    <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                  ) : (
                    <ExternalLink className="w-3 h-3 mr-1.5" />
                  )}
                  Manage Billing
                </Button>
              </div>
            )}

            <div className="rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Auto-Refill</span>
                </div>
                <button
                  onClick={() => {
                    setAutoRefill((v) => !v);
                    toast.info(
                      autoRefill
                        ? "Auto-refill disabled."
                        : "Auto-refill enabled — we'll top you up when credits drop below 20."
                    );
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {autoRefill ? (
                    <ToggleRight className="w-8 h-8 text-primary" />
                  ) : (
                    <ToggleLeft className="w-8 h-8" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Automatically purchase the Starter Pack when your balance drops below 20 credits.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Buy Credits
              </h2>
              {loadingProducts ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-5 h-44 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(creditPacks.length > 0 ? creditPacks : FALLBACK_PACKS).map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onBuy={handleBuy}
                      loading={checkoutLoading === product.prices[0]?.id}
                      isSubscription={false}
                      currentPlan={plan}
                    />
                  ))}
                </div>
              )}
            </div>

            {!isProActive && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Upgrade to Pro
                </h2>
                {loadingProducts ? (
                  <div className="rounded-xl border border-border/40 bg-card/30 h-44 animate-pulse" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(subscriptionProducts.length > 0
                      ? subscriptionProducts
                      : FALLBACK_SUBSCRIPTION
                    ).map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onBuy={handleBuy}
                        loading={checkoutLoading === product.prices[0]?.id}
                        isSubscription={true}
                        currentPlan={plan}
                      />
                    ))}
                    <div className="rounded-xl border border-border/60 bg-card/30 p-5 flex flex-col gap-3">
                      <div>
                        <h3 className="font-semibold text-sm">Pro Perks</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Included with every Pro Plan</p>
                      </div>
                      <ul className="space-y-2">
                        {[
                          "2,000 credits every month",
                          "Priority model access",
                          "Unlimited session history",
                          "Advanced export formats",
                          "Early access to new features",
                        ].map((perk) => (
                          <li key={perk} className="flex items-center gap-2 text-xs">
                            <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                            <span>{perk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Transaction History
                </h2>
                <button
                  onClick={fetchTransactions}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/40 p-1">
                {loadingTx ? (
                  <div className="space-y-3 p-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted/30 animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-muted/30 rounded animate-pulse w-2/5" />
                          <div className="h-2.5 bg-muted/20 rounded animate-pulse w-1/4" />
                        </div>
                        <div className="w-12 h-3 bg-muted/30 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No transactions yet</p>
                    <p className="text-xs mt-1">Your credit history will appear here</p>
                  </div>
                ) : (
                  <div className="px-4">
                    <AnimatePresence initial={false}>
                      {transactions.map((tx) => (
                        <motion.div
                          key={tx.transactionId}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <TransactionRow tx={tx} />
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {txNextCursor && (
                      <div className="py-3 flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleLoadMoreTx}
                          disabled={loadingMoreTx}
                          className="text-xs text-muted-foreground"
                        >
                          {loadingMoreTx ? (
                            <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                          ) : (
                            <ChevronDown className="w-3 h-3 mr-1.5" />
                          )}
                          Load more
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_PACKS: BillingProduct[] = [
  {
    id: "starter_pack",
    name: "Starter Pack",
    description: "100 credits — great for exploring AI Brain",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "100" },
    prices: [
      { id: "price_starter", product: "starter_pack", unit_amount: 499, currency: "usd", recurring: null, active: true, metadata: { creditAmount: "100" } },
    ],
  },
  {
    id: "pro_pack",
    name: "Pro Pack",
    description: "500 credits — best value for power users",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "500" },
    prices: [
      { id: "price_pro_pack", product: "pro_pack", unit_amount: 1999, currency: "usd", recurring: null, active: true, metadata: { creditAmount: "500" } },
    ],
  },
  {
    id: "mega_pack",
    name: "Mega Pack",
    description: "1,000 credits — maximum savings",
    active: true,
    metadata: { type: "credit_pack", creditAmount: "1000" },
    prices: [
      { id: "price_mega_pack", product: "mega_pack", unit_amount: 3499, currency: "usd", recurring: null, active: true, metadata: { creditAmount: "1000" } },
    ],
  },
];

const FALLBACK_SUBSCRIPTION: BillingProduct[] = [
  {
    id: "pro_subscription",
    name: "Pro Plan",
    description: "2,000 credits per month + priority access",
    active: true,
    metadata: { type: "subscription", plan: "pro", creditAmount: "2000" },
    prices: [
      { id: "price_pro_monthly", product: "pro_subscription", unit_amount: 2900, currency: "usd", recurring: { interval: "month", interval_count: 1 }, active: true, metadata: { creditAmount: "2000", plan: "pro" } },
    ],
  },
];
