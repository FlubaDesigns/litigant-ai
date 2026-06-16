import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Brain, ArrowRight, Loader2, Check } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    credits: "50 credits",
    features: ["3 sessions/month", "2 AI models", "PDF export"],
  },
  {
    id: "starter" as const,
    name: "Starter",
    price: "$19/mo",
    credits: "500 credits",
    features: ["Unlimited sessions", "4 AI models", "All export formats", "Custom personas"],
  },
];

const registerSchema = z.object({
  displayName: z.string().min(2, "Display name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  plan: z.enum(["free", "starter"]),
});

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { signUp, signInGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "", plan: "free" },
  });

  const selectedPlan = form.watch("plan");

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsLoading(true);
    try {
      await signUp(values.email, values.password, values.displayName);
      toast.success("Access requested. Please verify your communication channel.");
      setLocation("/verify-email");
    } catch (error: any) {
      toast.error(error.message || "Failed to request access.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      await signInGoogle();
      toast.success("Google authentication successful. Session initiated.");
      setLocation("/session");
    } catch (error: any) {
      toast.error(error.message || "Failed to authenticate with Google.");
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
          <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">Request Clearance</h1>
          <p className="text-muted-foreground text-center text-sm">
            Register for access to the adversarial reasoning engine.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border p-8 rounded-xl shadow-2xl space-y-6">
          {/* Plan selection */}
          <div className="space-y-3">
            <Label>Access Level</Label>
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
              <Label htmlFor="displayName">Operator Designation</Label>
              <Input
                id="displayName"
                placeholder="Analyst Name"
                className="bg-background border-border/50 font-mono text-sm"
                {...form.register("displayName")}
              />
              {form.formState.errors.displayName && (
                <p className="text-destructive text-xs">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Operator Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@domain.com"
                className="bg-background border-border/50 font-mono text-sm"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Initial Passkey</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                className="bg-background border-border/50 font-mono text-sm"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  Processing Request...
                </>
              ) : (
                <>
                  Submit Request
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border/50" />
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-border/50" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full bg-transparent border-border hover:bg-secondary/50"
            onClick={handleGoogleSignIn}
          >
            <FcGoogle className="mr-2 w-5 h-5" />
            Authenticate with Google
          </Button>
        </div>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Clearance already granted?{" "}
          <Link href="/sign-in" className="text-primary hover:opacity-80 transition-opacity font-medium">
            Initiate Session
          </Link>
        </p>
      </div>
    </div>
  );
}
