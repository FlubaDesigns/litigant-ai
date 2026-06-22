import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Brain, ArrowRight, Loader2, Check } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { cn } from "@/lib/utils";
import { USER_ROLE_LABELS, type UserRole } from "@/services/firestoreService";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    credits: "100 credits",
    features: ["3 sessions/month", "2 AI models", "PDF export"],
  },
  {
    id: "starter" as const,
    name: "Starter",
    price: "$19/mo",
    credits: "500 credits",
    features: ["Unlimited sessions", "Up to 10 litigants", "All export formats", "Custom personas"],
  },
];

const registerSchema = z.object({
  displayName: z.string().min(2, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  plan: z.enum(["free", "starter"]),
  role: z.string().optional(),
  organization: z.string().optional(),
});

export default function RegisterPage() {
  const [location, setLocation] = useLocation();
  const { signUp, signInGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const next = new URLSearchParams(location.split("?")[1] ?? "").get("next") ?? "/session";

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "", plan: "free", role: "", organization: "" },
  });

  const selectedPlan = form.watch("plan");

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsLoading(true);
    try {
      await signUp(
        values.email,
        values.password,
        values.displayName,
        values.role || undefined,
        values.organization?.trim() || undefined,
      );
      toast.success("Account created — please verify your email.");
      if (values.plan === "starter") {
        setLocation("/billing");
      } else {
        setLocation(`/verify-email?next=${encodeURIComponent(next)}`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create account.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      await signInGoogle();
      toast.success("Signed in with Google.");
      setLocation(next);
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in with Google.");
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background brain-grid relative overflow-hidden py-12">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-lg px-4 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <Brain className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight font-sans">Litigant AI</span>
          </Link>
          <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">Create an account</h1>
          <p className="text-muted-foreground text-center text-sm">
            Get 100 free credits to explore the adversarial reasoning engine.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border p-8 rounded-xl shadow-2xl space-y-6">
          {/* Plan selection */}
          <div className="space-y-3">
            <Label>Plan</Label>
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => form.setValue("plan", plan.id)}
                  className={cn(
                    "relative p-4 rounded-lg border text-left transition-all",
                    selectedPlan === plan.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-border/80 hover:bg-secondary/30"
                  )}
                >
                  {selectedPlan === plan.id && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    </div>
                  )}
                  <div className="font-bold text-sm mb-0.5">{plan.name}</div>
                  <div className="text-primary text-xs font-mono mb-2">{plan.price}</div>
                  <div className="text-xs text-muted-foreground">{plan.credits}</div>
                  <ul className="mt-2 space-y-0.5">
                    {plan.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="text-primary">·</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input
                id="displayName"
                placeholder="First name, nickname, whatever you prefer"
                className="bg-background border-border/50"
                {...form.register("displayName")}
              />
              {form.formState.errors.displayName && (
                <p className="text-destructive text-xs">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="bg-background border-border/50"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="bg-background border-border/50"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Role — optional, helps us tailor the experience */}
            <div className="space-y-2">
              <Label htmlFor="role">
                How will you use Litigant AI?{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select
                onValueChange={(v) => form.setValue("role", v)}
                defaultValue=""
              >
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue placeholder="Pick one — or skip" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(USER_ROLE_LABELS) as [UserRole, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Organization — fully optional */}
            <div className="space-y-2">
              <Label htmlFor="organization">
                Organisation{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="organization"
                placeholder="Firm, university, company — leave blank if not applicable"
                className="bg-background border-border/50"
                {...form.register("organization")}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border/50" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-border/50" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full bg-transparent border-border hover:bg-secondary/50"
            onClick={handleGoogleSignIn}
          >
            <FcGoogle className="mr-2 w-5 h-5" />
            Continue with Google
          </Button>
        </div>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary hover:opacity-80 transition-opacity font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
