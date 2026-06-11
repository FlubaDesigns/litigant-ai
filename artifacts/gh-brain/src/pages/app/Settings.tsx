import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Settings, User as UserIcon, Sliders, AlertTriangle, Save,
  Eye, EyeOff, Download, Loader2, Shield, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile, getUserProfile } from "@/services/firestoreService";
import { getSessions, exportSessionAsMarkdown } from "@/services/sessionService";
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { auth, isConfigured } from "@/lib/firebase";
import { TEMPLATE_CATEGORIES } from "@/data/templates";

type TabId = "profile" | "preferences" | "danger";

interface DefaultSettings {
  courtMode: string;
  confidenceTarget: number;
  responseMode: string;
  outputFormat: string;
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ProfileTab({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const isEmailProvider = user.providerData.some((p: { providerId: string }) => p.providerId === "password");
  const isGoogleProvider = user.providerData.some((p: { providerId: string }) => p.providerId === "google.com");

  async function handleSaveProfile() {
    if (!displayName.trim()) { toast.error("Display name cannot be empty."); return; }
    setSavingProfile(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      await updateUserProfile(user.uid, { displayName: displayName.trim() });
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!newPassword) { toast.error("New password is required."); return; }
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (err: any) {
      if (err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential") {
        toast.error("Current password is incorrect.");
      } else {
        toast.error("Failed to change password.");
      }
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-8">
      <Section
        title="Display name"
        description="This is how you appear in the app."
      >
        <div className="flex gap-3 max-w-sm">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="bg-card border-border/60"
          />
          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile || displayName === user.displayName}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shrink-0"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : savedProfile ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
        </div>
      </Section>

      <Separator />

      <Section title="Email & auth provider">
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 max-w-sm">
            <div className="flex-1">
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Email address (read-only)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEmailProvider && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <Shield className="w-3 h-3" /> Email & password
              </div>
            )}
            {isGoogleProvider && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <Shield className="w-3 h-3" /> Google
              </div>
            )}
          </div>
        </div>
      </Section>

      {isEmailProvider && (
        <>
          <Separator />
          <Section
            title="Change password"
            description="You'll need to enter your current password to confirm."
          >
            <div className="space-y-3 max-w-sm">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current password</Label>
                <div className="relative">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-card border-border/60 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">New password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="bg-card border-border/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Confirm new password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="bg-card border-border/60"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                Change password
              </Button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function PreferencesTab({ user }: { user: User }) {
  const [settings, setSettings] = useState<DefaultSettings>({
    courtMode: "adversarial",
    confidenceTarget: 85,
    responseMode: "balanced",
    outputFormat: "report",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getUserProfile(user.uid).then((profile) => {
      if (profile?.defaultSettings) {
        setSettings((prev) => ({ ...prev, ...profile.defaultSettings }));
      }
    }).catch(() => {});
  }, [user.uid]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { defaultSettings: settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Preferences saved.");
    } catch {
      toast.error("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-md">
      <Section
        title="Default court configuration"
        description="These are pre-filled each time you start a new session. You can always override them."
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Default court mode</Label>
            <Select
              value={settings.courtMode}
              onValueChange={(v) => setSettings((s) => ({ ...s, courtMode: v }))}
            >
              <SelectTrigger className="bg-card border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adversarial">⚔️ Adversarial — debate</SelectItem>
                <SelectItem value="socratic">❓ Socratic — questioning</SelectItem>
                <SelectItem value="analysis">🔬 Analysis — examination</SelectItem>
                <SelectItem value="critique">🔍 Critique — review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Confidence target — {settings.confidenceTarget}%
            </Label>
            <Slider
              min={60}
              max={95}
              step={5}
              value={[settings.confidenceTarget]}
              onValueChange={([v]) => setSettings((s) => ({ ...s, confidenceTarget: v }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>60% quick</span>
              <span>80% standard</span>
              <span>95% thorough</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Response depth</Label>
            <Select
              value={settings.responseMode}
              onValueChange={(v) => setSettings((s) => ({ ...s, responseMode: v }))}
            >
              <SelectTrigger className="bg-card border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="thorough">Thorough</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Output format</Label>
            <Select
              value={settings.outputFormat}
              onValueChange={(v) => setSettings((s) => ({ ...s, outputFormat: v }))}
            >
              <SelectTrigger className="bg-card border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="report">Full Report</SelectItem>
                <SelectItem value="memo">Executive Memo</SelectItem>
                <SelectItem value="bullets">Bullet Points</SelectItem>
                <SelectItem value="verdict">Direct Verdict</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : saved ? (
          <Check className="w-4 h-4" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save preferences
      </Button>
    </div>
  );
}

function DangerTab({ user, onDelete }: { user: User; onDelete: () => void }) {
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function handleExportData() {
    setExportLoading(true);
    try {
      const idToken = await user.getIdToken();
      const sessions = await getSessions(idToken);
      const profile = await getUserProfile(user.uid);

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          createdAt: profile?.createdAt,
        },
        settings: profile?.defaultSettings,
        plan: profile?.plan,
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          question: s.question,
          templateId: s.templateId,
          status: s.status,
          confidence: s.confidence,
          creditsUsed: s.creditsUsed,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-brain-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported.");
    } catch {
      toast.error("Failed to export data.");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <Section
        title="Export your data"
        description="Download all your sessions and account data as a JSON file."
      >
        <Button
          onClick={handleExportData}
          disabled={exportLoading}
          variant="outline"
          className="gap-2 border-border/60"
        >
          {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export all data
        </Button>
      </Section>

      <Separator />

      <Section title="Delete account">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">This action is permanent</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deleting your account will permanently remove your profile, all saved sessions, and your credit balance. This cannot be undone.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Delete my account
          </Button>
        </div>
      </Section>

      <AlertDialog open={showDeleteDialog} onOpenChange={(o) => { if (!o) { setShowDeleteDialog(false); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  All your sessions, settings, and credits will be deleted. This cannot be reversed.
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">
                    Type <span className="font-mono text-destructive">DELETE</span> to confirm:
                  </p>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="border-destructive/30 focus-visible:ring-destructive/30"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== "DELETE"}
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SettingsPage() {
  const { user, removeAccount, firebaseReady } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  async function handleDeleteAccount() {
    try {
      await removeAccount();
      toast.success("Account deleted. Goodbye.");
      setLocation("/");
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        toast.error("Please sign out and sign back in before deleting your account.");
      } else {
        toast.error("Failed to delete account. Please try again.");
      }
    }
  }

  if (!firebaseReady || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Settings className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Settings unavailable</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Sign in with Firebase to manage your account settings and preferences.
        </p>
        <Button onClick={() => setLocation("/sign-in")} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          {/* Sidebar tabs */}
          <nav className="sm:w-44 shrink-0">
            <div className="flex sm:flex-col gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors w-full",
                    activeTab === id
                      ? id === "danger"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className={cn("w-4 h-4", id === "danger" && activeTab === id ? "text-destructive" : "")} />
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6">
              {activeTab === "profile" && <ProfileTab user={user} />}
              {activeTab === "preferences" && <PreferencesTab user={user} />}
              {activeTab === "danger" && <DangerTab user={user} onDelete={handleDeleteAccount} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
