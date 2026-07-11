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
import { ArrowRight, Loader2, Zap } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { USER_ROLE_LABELS, type UserRole } from "@/services/firestoreService";

const registerSchema = z.object({
  displayName: z.string().min(2, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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
    defaultValues: { displayName: "", email: "", password: "", role: "", organization: "" },
  });

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
      setLocation(`/verify-email?next=${encodeURIComponent(next)}`);
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
    <div className="auth-shell bg-background brain-grid relative overflow-hidden">
      <div className="auth-glow" />

      <div className="auth-inner auth-inner--wide">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Litigant AI" className="w-9 h-9" />
            <span className="text-2xl font-bold tracking-tight font-sans">Litigant AI</span>
          </Link>
          <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">Create an account</h1>
          <p className="text-muted-foreground text-center text-sm">
            Get 100 free credits to explore the adversarial reasoning engine.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border p-8 rounded-xl shadow-2xl space-y-6">
          {/* Free trial callout */}
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-sm font-semibold text-primary">100 free credits on signup</div>
              <div className="text-xs text-muted-foreground mt-0.5">No card required. Top up anytime — credits never expire.</div>
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
