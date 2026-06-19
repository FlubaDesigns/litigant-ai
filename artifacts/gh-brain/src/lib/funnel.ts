/**
 * Build auth funnel URLs that carry a destination through sign-up / sign-in.
 *
 * Usage:
 *   const { register, signIn } = funnelTo("/session?templateId=business-plan");
 *   <Link href={register}>Start free</Link>
 *   <Link href={signIn}>Sign in</Link>
 *
 * Register, SignIn, and VerifyEmail all read the ?next= param and redirect
 * there after auth — so no page needs its own funnel logic.
 */
export function funnelTo(destination: string) {
  const encoded = encodeURIComponent(destination);
  return {
    register: `/register?next=${encoded}`,
    signIn:   `/sign-in?next=${encoded}`,
  };
}
