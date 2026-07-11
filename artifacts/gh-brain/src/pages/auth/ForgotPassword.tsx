import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";

const resetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof resetSchema>) {
    setIsLoading(true);
    try {
      await resetPassword(values.email);
      setIsSubmitted(true);
      toast.success("Recovery protocol initiated.");
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate recovery protocol.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-shell bg-background relative overflow-hidden">
      <div className="auth-glow" />

      <div className="auth-inner">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Litigant AI" className="w-9 h-9" />
            <span className="text-2xl font-bold tracking-tight text-foreground font-sans">Litigant AI</span>
          </Link>
          <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mb-4 border border-border">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl font-semibold font-serif tracking-tight mb-3">Recover Access</h1>
          <p className="text-muted-foreground text-center">
            Initiate passkey reset protocol.
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg shadow-2xl">
          {isSubmitted ? (
            <div className="text-center space-y-6">
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <p className="text-sm font-mono text-primary">
                  RECOVERY SIGNAL TRANSMITTED
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                If the designation exists in our records, instructions have been securely transmitted to that channel.
              </p>
              <Link href="/sign-in" className="inline-flex items-center text-primary hover:text-primary-glow text-sm font-medium transition-all">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Transmitting...
                  </>
                ) : (
                  "Transmit Reset Link"
                )}
              </Button>
            </form>
          )}
        </div>

        {!isSubmitted && (
          <p className="text-center mt-8 text-sm text-muted-foreground">
            <Link href="/sign-in" className="inline-flex items-center text-primary hover:text-primary-glow font-medium transition-all">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Return to Login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
