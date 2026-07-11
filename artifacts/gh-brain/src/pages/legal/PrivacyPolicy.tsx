import { Link } from "wouter";
import { Shield, ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-10">Last updated: July 11, 2026</p>

        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 mb-10">
          <p className="text-sm text-amber-300 font-semibold mb-1">Entertainment Purposes Only</p>
          <p className="text-sm text-amber-200/80">
            Litigant AI is an entertainment and exploratory reasoning tool. It is <strong>not a law firm, financial advisor, medical provider, or professional services firm</strong>. Nothing produced by this service constitutes legal, financial, medical, or professional advice of any kind. See our Terms of Service for the full disclaimer.
          </p>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Who We Are</h2>
            <p className="text-muted-foreground leading-relaxed">
              Litigant AI ("we", "us", or "our") operates the Litigant AI platform available at litigant-ai.com. We provide an adversarial AI reasoning engine for entertainment and exploratory thinking purposes. This Privacy Policy describes how we collect, use, and protect information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Account information:</strong> When you register, we collect your name, email address, and optionally your organization and role.</p>
              <p><strong className="text-foreground">Session content:</strong> Questions and prompts you submit are processed by third-party AI providers (OpenAI, Anthropic, Google, xAI) to generate responses. We may retain session data to improve the service and to maintain your session history.</p>
              <p><strong className="text-foreground">Payment information:</strong> Payments are processed by Square. We do not store your full card number. We retain transaction records (amount, date, credit grant) for billing purposes.</p>
              <p><strong className="text-foreground">Usage data:</strong> We collect standard server logs including IP addresses, browser type, pages visited, and feature usage to operate and improve the service.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
              <li>To provide and operate the Litigant AI service</li>
              <li>To process payments and manage your credit balance</li>
              <li>To send transactional emails (account verification, password reset)</li>
              <li>To maintain session history accessible to your account</li>
              <li>To detect and prevent abuse or fraudulent activity</li>
              <li>To improve our models and service quality</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">We share data with the following third parties to operate the service:</p>
            <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
              <li><strong className="text-foreground">OpenAI, Anthropic, Google, xAI:</strong> Your session prompts are sent to these AI providers to generate responses. Their respective privacy policies govern their data use.</li>
              <li><strong className="text-foreground">Firebase (Google):</strong> Authentication and database storage.</li>
              <li><strong className="text-foreground">Square:</strong> Payment processing.</li>
              <li><strong className="text-foreground">Resend:</strong> Transactional email delivery.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">We do not sell your personal data to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              Account data is retained for the duration of your account. Session history is retained to provide the service. You may request deletion of your account and associated data by contacting us. Payment records may be retained as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use industry-standard security practices including encrypted connections (HTTPS), Firebase Authentication for credential management, and access controls on our infrastructure. No system is completely secure; use the service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may access, update, or delete your account information through the Settings page. To request full data deletion or a copy of your data, contact us at the email below. If you are located in the EU/EEA, you may have additional rights under GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use session cookies for authentication and local storage for user preferences. We do not use advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Children</h2>
            <p className="text-muted-foreground leading-relaxed">
              Litigant AI is not intended for users under the age of 13. We do not knowingly collect information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify registered users of material changes via email or in-app notice. Continued use of the service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this Privacy Policy? Contact us at <span className="text-primary">info@litigant-ai.com</span>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>© 2026 Litigant AI. All rights reserved.</span>
          <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service →</Link>
        </div>
      </div>
    </div>
  );
}
