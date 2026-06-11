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
import { Brain, ArrowRight, Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

const registerSchema = z.object({
  displayName: z.string().min(2, "Display name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { signUp, signInGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background brain-grid relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <Brain className="w-8 h-8 text-primary text-primary-glow" />
            <span className="text-2xl font-bold tracking-tight text-foreground font-sans">AI Brain</span>
          </Link>
          <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">Request Clearance</h1>
          <p className="text-muted-foreground text-center">
            Register for access to the adversarial reasoning engine.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border p-8 rounded-xl shadow-2xl">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="displayName">Operator Designation</Label>
              <Input
                id="displayName"
                placeholder="Analyst Name"
                className="bg-background border-border/50 focus:border-primary-glow font-mono text-sm"
                {...form.register("displayName")}
              />
              {form.formState.errors.displayName && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Operator Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@domain.com"
                className="bg-background border-border/50 focus:border-primary-glow font-mono text-sm"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Initial Passkey</Label>
              <Input
                id="password"
                type="password"
                className="bg-background border-border/50 focus:border-primary-glow font-mono text-sm"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.password.message}</p>
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

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-border/50"></div>
            <span className="px-4 text-xs text-muted-foreground font-mono uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-border/50"></div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full bg-transparent border-border hover:bg-secondary/50 transition-colors"
            onClick={handleGoogleSignIn}
          >
            <FcGoogle className="mr-2 w-5 h-5" />
            Authenticate with Google
          </Button>
        </div>

        <p className="text-center mt-8 text-sm text-muted-foreground">
          Clearance already granted?{" "}
          <Link href="/sign-in" className="text-primary hover:text-primary-glow transition-all font-medium">
            Initiate Session
          </Link>
        </p>
      </div>
    </div>
  );
}
