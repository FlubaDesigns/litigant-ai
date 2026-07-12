import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Settings, User as UserIcon, Sliders, AlertTriangle, Save,
  Eye, EyeOff, Download, Loader2, Shield, Check, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile, getUserProfile, USER_ROLE_LABELS, type UserRole } from "@/services/firestoreService";
import { getAllSessions, exportSessionAsMarkdown, deleteAccount } from "@/services/sessionService";
import {
  updateProfile,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";

type TabId = "profile" | "preferences" | "notifications" | "danger";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "notifications", label: "Notifications", icon: Bell },
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
  const { userProfile } = useAuth();

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [newEmail, setNewEmail] = useState(user.email ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);

  // Role + organisation — synced from Firestore (arrives async after mount)
  const [role, setRole] = useState<string>(userProfile?.role ?? "");
  const [organization, setOrganization] = useState(userProfile?.organization ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setRole(userProfile?.role ?? "");
    setOrganization(userProfile?.organization ?? "");
  }, [userProfile?.role, userProfile?.organization]);

  // Password section
  const [reauthPassword, setReauthPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Email section
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const isEmailProvider = user.providerData.some((p: { providerId: string }) => p.providerId === "password");
  const isGoogleProvider = user.providerData.some((p: { providerId: string }) => p.providerId === "google.com");

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        role: (role as UserRole) || undefined,
        organization: organization.trim() || undefined,
      });
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveName() {
    if (!displayName.trim()) { toast.error("Display name cannot be empty."); return; }
    setSavingName(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      await updateUserProfile(user.uid, { displayName: displayName.trim() });
      setSavedName(true);
      setTimeout(() => setSavedName(false), 2000);
      toast.success("Name updated.");
    } catch {
      toast.error("Failed to update name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleUpdateEmail() {
    if (!newEmail.trim() || newEmail === user.email) { toast.error("Enter a new email address."); return; }
    if (!emailPassword) { toast.error("Enter your current password to confirm."); return; }
    setSavingEmail(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, emailPassword);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, newEmail.trim());
      await updateUserProfile(user.uid, { email: newEmail.trim() });
      setEmailPassword("");
      toast.success("Email updated. Please verify your new address.");
    } catch (err: any) {
      if (err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential") {
        toast.error("Current password is incorrect.");
      } else if (err?.code === "auth/email-already-in-use") {
        toast.error("That email address is already in use.");
      } else if (err?.code === "auth/invalid-email") {
        toast.error("Invalid email address.");
      } else {
        toast.error("Failed to update email.");
      }
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword() {
    if (!newPassword) { toast.error("New password is required."); return; }
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, reauthPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setReauthPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed.");
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
      {/* Display name */}
      <Section title="Display name" description="This is how you appear in the app.">
        <div className="flex gap-3 max-w-sm">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="bg-card border-border/60"
          />
          <Button
            onClick={handleSaveName}
            disabled={savingName || displayName === user.displayName}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shrink-0"
          >
            {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : savedName ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
        </div>
      </Section>

      <Separator />

      {/* Role + Organisation */}
      <Section
        title="About you"
        description="Helps us tailor suggestions — both fields are optional and can be changed any time."
      >
        <div className="space-y-3 max-w-sm">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">How do you use Litigant AI?</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-card border-border/60">
                <SelectValue placeholder="Pick one — or leave blank" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(USER_ROLE_LABELS) as [UserRole, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Organisation (optional)</Label>
            <Input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Firm, university, company…"
              className="bg-card border-border/60"
            />
          </div>
          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
        </div>
      </Section>

      <Separator />

      {/* Email */}
      <Section title="Email address" description={isEmailProvider ? "Changing your email requires your current password." : "Email linked via Google."}>
        <div className="space-y-3 max-w-sm">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className="bg-card border-border/60"
            disabled={!isEmailProvider}
          />
          {isEmailProvider && (
            <>
              <div className="relative">
                <Input
                  type={showEmailPassword ? "text" : "password"}
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Current password to confirm"
                  className="bg-card border-border/60 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={handleUpdateEmail}
                disabled={savingEmail || !emailPassword || newEmail === user.email}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                {savingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
                Update email
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
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
      </Section>

      {isEmailProvider && (
        <>
          <Separator />
          <Section title="Change password" description="You'll need your current password to confirm.">
            <div className="space-y-3 max-w-sm">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current password</Label>
                <div className="relative">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
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
                disabled={savingPassword || !reauthPassword || !newPassword || !confirmPassword}
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

interface DefaultSettings {
  courtMode: string;
  litigantCount: number;
  confidenceTarget: number;
  responseMode: string;
  outputFormat: string;
}

function PreferencesTab({ user }: { user: User }) {
  const [settings, setSettings] = useState<DefaultSettings>({
    courtMode: "adversarial",
    litigantCount: 3,
    confidenceTarget: 80,
    responseMode: "balanced",
    outputFormat: "report",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getUserProfile(user.uid).then((profile) => {
      if (profile?.defaultSettings) {
        setSettings({
          courtMode: profile.defaultSettings.courtMode ?? "adversarial",
          litigantCount: profile.defaultSettings.litigantCount ?? 3,
          confidenceTarget: profile.defaultSettings.confidenceTarget ?? 80,
          responseMode: profile.defaultSettings.responseMode ?? "balanced",
          outputFormat: profile.defaultSettings.outputFormat ?? "report",
        });
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
      <Section title="Default court configuration" description="Pre-filled for each new session. You can always override.">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Default court mode</Label>
            <Select value={settings.courtMode} onValueChange={(v) => setSettings((s) => ({ ...s, courtMode: v }))}>
              <SelectTrigger className="bg-card border-border/60"><SelectValue /></SelectTrigger>
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
              min={60} max={95} step={5}
              value={[settings.confidenceTarget]}
              onValueChange={([v]) => setSettings((s) => ({ ...s, confidenceTarget: v }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>60% quick</span><span>80% standard</span><span>95% thorough</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Response depth</Label>
            <Select value={settings.responseMode} onValueChange={(v) => setSettings((s) => ({ ...s, responseMode: v }))}>
              <SelectTrigger className="bg-card border-border/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="thorough">Thorough</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Output format</Label>
            <Select value={settings.outputFormat} onValueChange={(v) => setSettings((s) => ({ ...s, outputFormat: v }))}>
              <SelectTrigger className="bg-card border-border/60"><SelectValue /></SelectTrigger>
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

      <Separator />

      <Section title="Default panel size" description="How many AI litigants debate each session. More minds = deeper analysis = more credits.">
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-2">
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <button
                key={n}
                onClick={() => setSettings((s) => ({ ...s, litigantCount: n }))}
                className={cn(
                  "rounded-xl border py-3 font-bold text-lg transition-all",
                  "hover:border-primary/60 hover:bg-primary/5",
                  settings.litigantCount === n
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40"
                    : "border-border/60 bg-card/40 text-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selected: <strong className="text-foreground">{settings.litigantCount} litigants</strong>. You can override this for any individual session from the config panel.
          </p>
        </div>
      </Section>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        Save preferences
      </Button>
    </div>
  );
}

function NotificationsTab({ user }: { user: User }) {
  const [notifications, setNotifications] = useState({
    sessionComplete: true,
    weeklyDigest: false,
    productUpdates: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getUserProfile(user.uid).then((profile) => {
      if (profile?.notifications) {
        setNotifications((n) => ({ ...n, ...profile.notifications }));
      }
    }).catch(() => {});
  }, [user.uid]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { notifications });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Notification preferences saved.");
    } catch {
      toast.error("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  const prefs = [
    {
      key: "sessionComplete" as const,
      label: "Session complete",
      description: "Notify when a Brain Session finishes processing.",
    },
    {
      key: "weeklyDigest" as const,
      label: "Weekly digest",
      description: "Summary of your session activity each week.",
    },
    {
      key: "productUpdates" as const,
      label: "Product updates",
      description: "New features, templates, and major improvements.",
    },
  ];

  return (
    <div className="space-y-6 max-w-md">
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        Email notifications will be sent to <strong>{user.email}</strong>. Firebase email delivery requires a configured sender — these preferences are stored now and will take effect once email is wired.
      </div>

      <div className="space-y-4">
        {prefs.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              checked={notifications[key]}
              onCheckedChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
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
      const [allSessions, profile] = await Promise.all([
        getAllSessions(idToken),
        getUserProfile(user.uid),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          createdAt: profile?.createdAt,
          plan: profile?.plan,
          creditBalance: profile?.creditBalance,
        },
        settings: profile?.defaultSettings,
        notifications: profile?.notifications,
        sessions: allSessions.map((s) => ({
          id: s.id,
          title: s.title,
          question: s.question,
          templateId: s.templateId,
          status: s.status,
          confidence: s.confidence,
          creditsUsed: s.creditsUsed,
          starred: s.starred,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `litigant-ai-export-${Date.now()}.json`;
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
      <Section title="Export your data" description="Download all your sessions and account data as a JSON file.">
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
                Deleting your account will permanently remove your profile, all saved sessions, feedback, and your credit balance. This cannot be undone.
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
                <p>All your sessions, settings, and credits will be permanently deleted. This cannot be reversed.</p>
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
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    try {
      // Step 1: Delete all Firestore data server-side (sessions, session_turns, feedback, profile).
      // This MUST succeed before we touch the auth account — if it fails we surface an error
      // and leave the account intact so the user can retry.
      const idToken = await user.getIdToken();
      await deleteAccount(idToken);

      // Step 2: Only now delete the Firebase Auth user.
      await removeAccount();
      toast.success("Account deleted.");
      setLocation("/");
    } catch (err: any) {
      setDeleting(false);
      if (err?.code === "auth/requires-recent-login") {
        toast.error("Please sign out and sign back in before deleting your account.");
      } else {
        toast.error(
          "Account deletion failed — your data has not been removed. Please try again or contact support.",
          { description: err?.message }
        );
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
    <div className="lgt-container">
      <section className="section">
        {/* ── Page hero ── */}
        <div className="row row-sb" style={{ paddingTop: "var(--sv)", paddingBottom: "calc(var(--sv) * 0.5)" }}>
          <div className="flex-row">
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Settings style={{ width: 22, height: 22, color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="eyebrow">Account</p>
              <h1 className="section-title" style={{ margin: 0 }}>Settings</h1>
              <p className="section-body" style={{ marginTop: "0.25rem" }}>Manage your profile, notifications, and account preferences</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          {/* Sidebar */}
          <nav className="sm:w-48 shrink-0">
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
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6">
              {deleting ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Deleting account data…</p>
                </div>
              ) : (
                <>
                  {activeTab === "profile" && <ProfileTab user={user} />}
                  {activeTab === "preferences" && <PreferencesTab user={user} />}
                  {activeTab === "notifications" && <NotificationsTab user={user} />}
                  {activeTab === "danger" && <DangerTab user={user} onDelete={handleDeleteAccount} />}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
