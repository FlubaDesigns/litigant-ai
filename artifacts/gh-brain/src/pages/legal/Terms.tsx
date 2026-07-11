import { Link } from "wouter";
import { Scale, ArrowLeft, AlertTriangle } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Terms of Service</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-10">Last updated: July 11, 2026</p>

        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 font-bold mb-1">Entertainment Purposes Only — Not Professional Advice</p>
              <p className="text-sm text-red-200/80 leading-relaxed">
                Litigant AI is an <strong>entertainment and exploratory reasoning tool</strong>. All outputs — including verdicts, analyses, briefs, memos, and any other generated content — are produced by AI models and are provided <strong>solely for entertainment, curiosity, and exploratory thinking</strong>.
              </p>
              <p className="text-sm text-red-200/80 leading-relaxed mt-2">
                <strong>Nothing on this platform constitutes legal advice, financial advice, medical advice, or professional advice of any kind.</strong> Do not rely on any output from Litigant AI as a substitute for consultation with a qualified attorney, financial advisor, physician, or other licensed professional. Always apply your own independent judgment before acting on any output.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 mb-10 text-sm text-amber-200/70 leading-relaxed">
          By creating an account or using Litigant AI, you agree to these Terms. If you do not agree, do not use the service.
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. The Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Litigant AI provides an adversarial AI reasoning engine that simulates multiple AI "litigants" debating a question and returning a verdict. The service is intended for entertainment, intellectual exploration, research, and critical thinking exercises. It is not a law firm, financial advisory, medical practice, or professional services firm of any kind.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 13 years old to use this service. By using Litigant AI, you represent that you meet this requirement and have the legal capacity to enter into these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Credits and Payments</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>Litigant AI operates on a pay-as-you-go credit system. Credits are consumed when you run AI sessions.</p>
              <p>Credits are non-refundable except where required by applicable law. Credits have no cash value and cannot be transferred between accounts.</p>
              <p>Prices are displayed in USD. Payments are processed securely through Square. We reserve the right to change credit pricing with reasonable notice.</p>
              <p>Welcome bonus credits are provided at signup at our discretion and may be modified or discontinued at any time.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">You agree not to use Litigant AI to:</p>
            <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
              <li>Generate content that is illegal, harassing, threatening, or defamatory</li>
              <li>Attempt to circumvent credit usage, access controls, or rate limits</li>
              <li>Scrape, reverse-engineer, or reproduce the service in a competing product</li>
              <li>Submit content that infringes third-party intellectual property rights</li>
              <li>Present AI-generated outputs as actual professional advice to third parties without appropriate disclosure</li>
              <li>Use the service in any way that violates applicable laws or regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT OUTPUTS WILL BE ACCURATE, COMPLETE, OR SUITABLE FOR ANY PURPOSE. AI-GENERATED OUTPUTS ARE PROBABILISTIC AND MAY BE INCORRECT, BIASED, OR INCOMPLETE.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LITIGANT AI AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO DAMAGES ARISING FROM RELIANCE ON AI-GENERATED OUTPUTS. OUR TOTAL LIABILITY TO YOU SHALL NOT EXCEED THE AMOUNT YOU PAID FOR CREDITS IN THE 30 DAYS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of the questions and prompts you submit. You grant us a limited license to process your inputs to provide the service. AI-generated outputs are provided to you for your personal use. The Litigant AI platform, branding, and underlying technology remain our property.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these Terms, abuse the service, or engage in fraudulent activity. You may delete your account at any time through Settings. Unused credits are forfeited upon termination for cause.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Third-Party AI Providers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Litigant AI uses third-party AI models (OpenAI, Anthropic, Google, xAI) to generate responses. We are not responsible for the content, accuracy, or behavior of these models. Your use of the service is also subject to the terms of these providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these Terms at any time. Material changes will be communicated via email or in-app notice. Continued use of the service after changes take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of the United States. Any disputes shall be resolved through binding arbitration or in the courts of the applicable jurisdiction, to the extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">12. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these Terms? Contact us at <span className="text-primary">info@litigant-ai.com</span>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>© 2026 Litigant AI. All rights reserved.</span>
          <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy →</Link>
        </div>
      </div>
    </div>
  );
}
