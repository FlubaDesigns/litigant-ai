/** Read-only metadata for authentication failures; no credentials or user records leave this module. */
export async function inspectAuthRuntime(service, read) {
  const spec = service.spec?.template?.spec;
  const env = spec?.containers?.[0]?.env || [];
  const entry = name => env.find(row => row.name === name);
  const credential = entry('FIREBASE_SERVICE_ACCOUNT') || entry('FIREBASE_SERVICE_ACCOUNT_JSON_V2') || entry('FIREBASE_SERVICE_ACCOUNT_JSON');
  const report = { usesAdc: entry('FIREBASE_USE_ADC')?.value === 'true', credentialSource: credential?.valueFrom ? 'secret-manager' : credential?.value ? 'environment' : 'none', projectMatches: entry('FIREBASE_PROJECT_ID')?.value === 'litigant-ai' };
  const inspect = async (label, url, method = 'GET', body) => {
    try { return { data: await read(url, label, method, body) }; }
    catch (error) { return { httpStatus: error.httpStatus || null }; }
  };
  const owner = await inspect('authentication owner metadata', 'https://identitytoolkit.googleapis.com/v1/projects/litigant-ai/accounts:lookup', 'POST', { email: ['flubadesigns@gmail.com'] });
  if (owner.data) {
    const user = owner.data.users?.[0];
    let claims = {}; try { claims = JSON.parse(user?.customAttributes || '{}'); } catch {}
    report.owner = { found: !!user, verified: user?.emailVerified === true, disabled: user?.disabled === true, admin: claims.admin === true };
  } else report.owner = { httpStatus: owner.httpStatus };
  const permissions = await inspect('authentication executor permissions', 'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions', 'POST', { permissions: ['firebaseauth.users.get', 'firebaseauth.users.delete', 'firebaseauth.users.update', 'iam.serviceAccounts.getIamPolicy', 'iam.serviceAccounts.setIamPolicy'] });
  report.executorPermissions = permissions.data?.permissions || [];
  const policy = await inspect('authentication runtime roles', 'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:getIamPolicy', 'POST', { options: { requestedPolicyVersion: 3 } });
  report.runtimeRoles = (policy.data?.bindings || []).filter(binding => binding.members?.includes('serviceAccount:' + spec?.serviceAccountName)).map(binding => ({ role: binding.role, conditional: !!binding.condition }));
  return report;
}
