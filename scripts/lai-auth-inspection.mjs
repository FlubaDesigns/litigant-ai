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
  const accounts = await inspect('administrator claim metadata', 'https://identitytoolkit.googleapis.com/v1/projects/litigant-ai/accounts:batchGet?maxResults=1000');
  if (accounts.data) {
    const eligible = (accounts.data.users || []).filter(user => {
      let claims = {}; try { claims = JSON.parse(user.customAttributes || '{}'); } catch {}
      return !user.disabled && user.emailVerified === true && claims.admin === true;
    });
    report.administrators = { count: eligible.length, complete: !accounts.data.nextPageToken };
  } else report.administrators = { httpStatus: accounts.httpStatus };
  if (spec?.serviceAccountName) {
    const signing = await inspect('runtime signing permissions', 'https://iam.googleapis.com/v1/projects/-/serviceAccounts/' + encodeURIComponent(spec.serviceAccountName) + ':testIamPermissions', 'POST', { permissions: ['iam.serviceAccounts.signBlob', 'iam.serviceAccounts.setIamPolicy'] });
    report.executorSigningPermissions = signing.data?.permissions || [];
    const policy = await inspect('runtime signing policy', 'https://iam.googleapis.com/v1/projects/-/serviceAccounts/' + encodeURIComponent(spec.serviceAccountName) + ':getIamPolicy', 'POST', { options: {requestedPolicyVersion: 3} });
    report.runtimeSelfSigning = policy.data ? (policy.data.bindings || []).some(binding => binding.role === 'roles/iam.serviceAccountTokenCreator' && !binding.condition && binding.members?.includes('serviceAccount:' + spec.serviceAccountName)) : null;
  }
  const permissions = await inspect('authentication executor permissions', 'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions', 'POST', { permissions: ['firebaseauth.users.get', 'firebaseauth.users.delete', 'firebaseauth.users.update', 'iam.serviceAccounts.getIamPolicy', 'iam.serviceAccounts.setIamPolicy'] });
  report.executorPermissions = permissions.data?.permissions || [];
  const policy = await inspect('authentication runtime roles', 'https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:getIamPolicy', 'POST', { options: { requestedPolicyVersion: 3 } });
  report.runtimeRoles = (policy.data?.bindings || []).filter(binding => binding.members?.includes('serviceAccount:' + spec?.serviceAccountName)).map(binding => ({ role: binding.role, conditional: !!binding.condition }));
  return report;
}
