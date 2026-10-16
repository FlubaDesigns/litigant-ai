/** LAI-only release controller. Inspection is read-only; deployment is descriptor-authorized.
 * No private Engine implementation or credentials belong in this public repository.
 */
import assert from 'node:assert/strict';
import {inspectFeedbackRules, deployFeedbackRules} from './lai-feedback-rules.mjs';
import { migrateCredentials, prepareMigration, migrationValues } from './lai-credential-migration.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REPOSITORY = 'FlubaDesigns/litigant-ai';
export const WORKFLOW = '.github/workflows/deploy-cloudrun.yml';
export const DESCRIPTOR = 'deployment/lai-release.json';
export const ORIGINS = ['https://litigant-ai.com', 'https://www.litigant-ai.com', 'https://litigant-ai.web.app'];
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[1-9][0-9]{0,19}$/;
const own = (o, k) => Object.hasOwn(o, k);
const fail = (message) => { throw new Error(message); };
function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unexpected or missing fields`);
}
function sha(value, label) {
  assert(typeof value === 'string' && SHA.test(value) && !/^(.)\1{39}$/.test(value), `${label}: full non-placeholder SHA required`);
  return value;
}
function runPin(value, label) {
  assert(typeof value.runId === 'string' && ID.test(value.runId), `${label}: positive decimal runId string required`);
  assert(Number.isSafeInteger(value.runAttempt) && value.runAttempt > 0, `${label}: positive runAttempt required`);
}
export function validateEngineApproval(engine) {
  exactKeys(engine, ['repository', 'commitSha', 'runId', 'runAttempt'], 'engine');
  assert.equal(engine.repository, 'FlubaDesigns/fluba-designs', 'wrong Engine repository');
  sha(engine.commitSha, 'Engine commit'); runPin(engine, 'Engine');
  return engine;
}
export function validateDescriptor(d, controllerSha) {
  sha(controllerSha, 'controller SHA');
  exactKeys(d, ['schemaVersion', 'action', 'sourceCommit', 'project', 'region', 'service', 'hostingSite', 'approval'], 'descriptor');
  assert.equal(d.schemaVersion, 1); assert.equal(d.project, 'litigant-ai');
  assert.equal(d.region, 'us-central1'); assert.equal(d.service, 'api'); assert.equal(d.hostingSite, 'litigant-ai');
  assert(['inspect', 'deploy', 'migrate-credentials'].includes(d.action), 'unsupported action');
  if (d.action === 'inspect') {
    assert.equal(d.sourceCommit, null, 'inspect resolves only the controller SHA');
    assert.equal(d.approval, null, 'inspect cannot carry deployment approval');
    return { ...d, sourceCommit: controllerSha };
  }
  sha(d.sourceCommit, 'source commit');
  exactKeys(d.approval, ['controlSha', 'preflight', 'engine'], 'approval');
  assert.equal(d.approval.controlSha, d.sourceCommit, 'approved control must equal inspected source');
  assert.notEqual(d.sourceCommit, controllerSha, 'deploy requires a new descriptor commit');
  exactKeys(d.approval.preflight, ['runId', 'runAttempt', 'headSha'], 'preflight');
  runPin(d.approval.preflight, 'preflight');
  assert.equal(d.approval.preflight.headSha, d.sourceCommit, 'preflight source mismatch');
  validateEngineApproval(d.approval.engine);
  return d;
}
export function validateDeploymentCommit(commit, files, sourceCommit) {
  assert(Array.isArray(commit.parents) && commit.parents.length === 1, 'deploy must have exactly one parent');
  assert.equal(commit.parents[0].sha, sourceCommit, 'deploy must directly follow approved source');
  assert(Array.isArray(files) && files.length === 1, 'deploy must modify only the descriptor');
  assert.equal(files[0].filename, DESCRIPTOR); assert.equal(files[0].status, 'modified');
  assert(!files[0].previous_filename, 'renamed descriptor rejected');
}
function validRun(run, headSha) {
  assert.equal(run.head_sha, headSha, 'run source mismatch');
  assert.equal(run.path, WORKFLOW, 'wrong workflow');
  assert.equal(run.head_branch, 'main'); assert.equal(run.event, 'push');
  assert.equal(run.repository?.full_name, REPOSITORY, 'wrong repository');
}
function validJob(jobs, name, headSha, attempt) {
  const matches = jobs.jobs?.filter(job => job.name === name) ?? [];
  assert.equal(matches.length, 1, `one ${name} job required`);
  const job = matches[0];
  assert.equal(job.head_sha, headSha, `${name} job source mismatch`);
  assert.equal(job.status, 'completed'); assert.equal(job.conclusion, 'success');
  if (job.run_attempt !== undefined) assert.equal(job.run_attempt, attempt, 'job attempt mismatch');
  if (job.steps) assert(job.steps.every(step => ['success', 'skipped'].includes(step.conclusion)), 'job contains incomplete or failed step');
  return job;
}
export function validateCheckJob(jobs, headSha, attempt) { return validJob(jobs, 'check-release', headSha, attempt); }
export function validatePreflightEvidence(run, jobs, approval) {
  const pin = approval.preflight;
  validRun(run, approval.controlSha);
  assert.equal(String(run.id), pin.runId); assert.equal(run.run_attempt, pin.runAttempt, 'latest run attempt differs from approval');
  assert.equal(run.head_sha, pin.headSha); assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  return validJob(jobs, 'cloud-preflight', pin.headSha, pin.runAttempt);
}
export function selectSuccessfulCiRun(runs, headSha) {
  const list = Array.isArray(runs) ? runs : runs.workflow_runs;
  const matching = list.filter(run => run.head_sha === headSha && run.path === WORKFLOW && run.head_branch === 'main' && run.event === 'push' && run.repository?.full_name === REPOSITORY);
  assert(matching.length, 'exact-source CI run missing');
  matching.sort((a, b) => Number(b.id) - Number(a.id));
  assert.equal(matching[0].status, 'completed', 'latest source CI is not complete');
  assert.equal(matching[0].conclusion, 'success', 'latest source CI failed');
  return matching[0];
}
export function validateHostingConfig(config) {
  assert(config && typeof config === 'object' && !Array.isArray(config), 'Firebase config required');
  assert(Object.keys(config).every(k => ['hosting', 'firestore'].includes(k)), 'unexpected Firebase product or hooks');
  const h = config.hosting;
  assert(h && typeof h === 'object' && !Array.isArray(h), 'single hosting site required');
  assert(Object.keys(h).every(k => ['public', 'ignore', 'headers', 'rewrites'].includes(k)), 'unexpected hosting option, site, target, or hook');
  assert.equal(h.public, 'artifacts/gh-brain/dist/public');
  assert(Array.isArray(h.ignore) && h.ignore.every(x => typeof x === 'string'), 'hosting ignore required');
  assert(Array.isArray(h.headers), 'hosting headers required');
  assert.deepEqual(h.rewrites, [{ source: '/api-server/**', run: { serviceId: 'api', region: 'us-central1' } }, { source: '**', destination: '/index.html' }], 'hosting rewrite scope changed');
  return { hosting: { ...structuredClone(h), site: 'litigant-ai' } };
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}
const CHURN = new Set(['run.googleapis.com/client-name', 'run.googleapis.com/client-version', 'run.googleapis.com/operation-id', 'serving.knative.dev/creator', 'serving.knative.dev/lastModifier', 'run.googleapis.com/urls', 'client.knative.dev/nonce']);
function metadataRuntime(metadata = {}) {
  return { annotations: Object.fromEntries(Object.entries(metadata.annotations ?? {}).filter(([key]) => !CHURN.has(key))), labels: Object.fromEntries(Object.entries(metadata.labels ?? {}).filter(([key]) => !['client.knative.dev/nonce', 'serving.knative.dev/configuration', 'serving.knative.dev/configurationGeneration', 'serving.knative.dev/revision', 'serving.knative.dev/service', 'run.googleapis.com/startupProbeType'].includes(key))) };
}
export function runtimeFingerprint(service) {
  const spec = structuredClone(service.spec);
  assert(spec?.template?.spec?.containers?.length, 'service runtime missing');
  spec.template.metadata = metadataRuntime(spec.template.metadata);
  delete spec.template.spec.containers[0].image;
  spec.template.spec.containers[0].env = (spec.template.spec.containers[0].env ?? []).filter(v => !['DEPLOY_GIT_SHA', 'DEPLOY_TIMESTAMP'].includes(v.name)).sort((a, b) => a.name.localeCompare(b.name));
  return createHash('sha256').update(JSON.stringify(sorted({ spec, metadata: metadataRuntime(service.metadata) }))).digest('hex');
}
export function assertServiceReady(service) {
  assert.equal(service.apiVersion, 'serving.knative.dev/v1');
  assert.equal(service.kind, 'Service');
  assert.equal(service.metadata?.name, 'api', 'wrong Cloud Run service');
  assert(['litigant-ai', '781960492360'].includes(service.metadata?.namespace), 'wrong project');
  if (service.metadata.labels?.['cloud.googleapis.com/location']) assert.equal(service.metadata.labels['cloud.googleapis.com/location'], 'us-central1');
  const status = service.status;
  assert(status?.latestReadyRevisionName && status.latestReadyRevisionName === status.latestCreatedRevisionName, 'latest revision is not ready');
  assert(status.conditions?.some(c => c.type === 'Ready' && c.status === 'True'), 'service not ready');
  const traffic = status.traffic;
  assert(Array.isArray(traffic) && traffic.length === 1 && traffic[0].percent === 100 && traffic[0].latestRevision === true && traffic[0].revisionName === status.latestReadyRevisionName && !traffic[0].tag, 'latest revision must own 100% without split or tag');
  assert.deepEqual(service.spec?.traffic, [{ latestRevision: true, percent: 100 }], 'desired traffic must follow latest revision at 100%');
  assert(service.spec?.template?.spec?.serviceAccountName, 'runtime service account required');
  assert.equal(service.spec.template.spec.containers?.length, 1, 'exactly one existing API container required');
  assert(service.spec.template.spec.containers[0].image, 'existing runtime image required');
  assert(typeof service.metadata.resourceVersion === 'string' && service.metadata.resourceVersion, 'service resourceVersion required');
  assert(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(status.url ?? '') || /^https:\/\/[a-z0-9-]+\.run\.app$/.test(status.url ?? ''), 'unexpected Cloud Run URL');
  return service;
}
export function assertAllowedImage(image) {
  assert(/^gcr\.io\/litigant-ai\/api@sha256:[a-f0-9]{64}$/.test(image), 'only digest-pinned LAI API image allowed');
  return image;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', timeout: 20 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, ...options });
  // Command output can contain build-time public config or runtime credentials. Never echo it.
  if (result.status !== 0) fail(`${command} ${args[0] ?? ''} failed (exit ${result.status ?? 'unavailable'}); captured output withheld`);
  return result.stdout.trim();
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function retryRead(operation, { attempts = 12, delayMs = 10000, pause = sleep } = {}) {
  assert(Number.isSafeInteger(attempts) && attempts > 0 && attempts <= 12, 'invalid read retry bound');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await operation(); } catch (error) {
      if (attempt === attempts) throw error;
      await pause(delayMs);
    }
  }
}
async function request(url, { label, token, method = 'GET', body, raw = false } = {}) {
  const response = await fetch(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) {
    const error = new Error(`${method} ${label ?? new URL(url).hostname}: HTTP ${response.status}`);
    error.httpStatus = response.status;
    // This fixed, metadata-only GET sends no user data. Capture only Google's
    // INVALID_ARGUMENT diagnostic; never log authorization headers or other bodies.
    if (method === 'GET' && label === 'read payment-history indexes' && response.status === 400) {
      const failure = await response.json().catch(() => null);
      if (failure?.error?.status === 'INVALID_ARGUMENT' && typeof failure.error.message === 'string') {
        error.apiStatus = 'INVALID_ARGUMENT';
        error.safeDetail = failure.error.message.replace(/[^\x20-\x7e]/g, ' ').slice(0, 400);
      }
    }
    throw error;
  }
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}
function envContext() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main'); assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
  sha(process.env.GITHUB_SHA, 'GITHUB_SHA');
  assert(ID.test(process.env.GITHUB_RUN_ID ?? '')); assert(ID.test(process.env.GITHUB_RUN_ATTEMPT ?? ''));
  assert(process.env.GITHUB_TOKEN, 'read-only GitHub token required');
  return { controllerSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, attempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
}
const github = endpoint => request(`https://api.github.com/repos/${REPOSITORY}/${endpoint}`, { label: `GitHub ${endpoint.split('?')[0]}`, token: process.env.GITHUB_TOKEN });
async function allJobs(runId, attempt) {
  const jobs = [];
  for (let page = 1; page <= 20; page++) {
    const response = await github(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`);
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) return { jobs };
  }
  fail('GitHub job pagination exceeded bound');
}
async function contentAt(file, ref) {
  const data = await github(`contents/${file}?ref=${ref}`);
  assert.equal(data.encoding, 'base64'); return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}
async function assertCurrentMain(context) {
  const branch = await github('git/ref/heads/main');
  assert.equal(branch.object.sha, context.controllerSha, 'Main moved: release stopped');
  // Check all workflow runs, including historical deployment workflows. Never race another writer.
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const result = await github(`actions/runs?branch=main&status=${status}&per_page=100`);
    assert(result.total_count <= 100, 'active workflow pagination unsafe');
    for (const active of result.workflow_runs) {
      if (String(active.id) === context.runId) continue;
      assert(!/deploy|release/i.test(`${active.path} ${active.name}`), 'another deployment/release workflow is active');
    }
  }
}
async function verifyCiAndEvidence(context, descriptor) {
  const current = await github(`actions/runs/${context.runId}`);
  validRun(current, context.controllerSha); assert.equal(current.run_attempt, context.attempt, 'controller attempt changed');
  validateCheckJob(await allJobs(context.runId, context.attempt), context.controllerSha, context.attempt);
  if (descriptor.action !== 'inspect') {
    const commit = await github(`commits/${context.controllerSha}?per_page=100`);
    validateDeploymentCommit(commit, commit.files, descriptor.sourceCommit);
    const inspected = await contentAt(DESCRIPTOR, descriptor.sourceCommit);
    assert.equal(validateDescriptor(inspected, descriptor.sourceCommit).action, 'inspect', 'approved source must be inspection commit');
    const pin = descriptor.approval.preflight;
    const runInfo = await github(`actions/runs/${pin.runId}`); // current metadata prevents accepting an obsolete rerun
    const jobs = await allJobs(pin.runId, pin.runAttempt);
    validatePreflightEvidence(runInfo, jobs, descriptor.approval);
    validateCheckJob(jobs, descriptor.sourceCommit, pin.runAttempt);
    const runs = await github(`actions/workflows/deploy-cloudrun.yml/runs?head_sha=${descriptor.sourceCommit}&branch=main&event=push&per_page=100`);
    assert(runs.total_count <= 100, 'source CI pagination unsafe');
    const latest = selectSuccessfulCiRun(runs, descriptor.sourceCommit);
    validateCheckJob(await allJobs(latest.id, latest.run_attempt), descriptor.sourceCommit, latest.run_attempt);
  }
  await assertCurrentMain(context);
}
async function loadPlan() {
  const context = envContext();
  const descriptor = validateDescriptor(JSON.parse(await readFile(DESCRIPTOR, 'utf8')), context.controllerSha);
  await verifyCiAndEvidence(context, descriptor);
  return { context, descriptor };
}
function tempPath(context, suffix) { return path.join(process.env.RUNNER_TEMP ?? fail('RUNNER_TEMP required'), `lai-${context.runId}-${context.attempt}-${suffix}`); }
async function plan() {
  const { context, descriptor } = await loadPlan();
  await appendFile(process.env.GITHUB_OUTPUT, `source=${descriptor.sourceCommit}\naction=${descriptor.action}\n`);
  console.log(`Validated ${descriptor.action}: source ${descriptor.sourceCommit}, controller ${context.controllerSha}`);
}
async function prepare() {
  const { context, descriptor } = await loadPlan();
  assert.equal(descriptor.action, 'deploy', 'inspection uses completed CI without a duplicate build');
  const sourceRoot = path.resolve('release-source');
  assert.equal(run('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot }), descriptor.sourceCommit, 'build checkout differs from approved source');
  const firebase = validateHostingConfig(JSON.parse(await readFile(path.join(sourceRoot, 'firebase.json'), 'utf8')));
  const publicConfig = await request('https://litigant-ai.web.app/__/firebase/init.json', { label: 'existing Firebase public configuration' });
  assert.equal(publicConfig.projectId, 'litigant-ai');
  const buildEnv = { ...process.env, NODE_ENV: 'production', BASE_PATH: '/', VITE_API_URL: '/api-server/api' };
  const mapping = { apiKey: 'VITE_FIREBASE_API_KEY', authDomain: 'VITE_FIREBASE_AUTH_DOMAIN', projectId: 'VITE_FIREBASE_PROJECT_ID', storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET', messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID', appId: 'VITE_FIREBASE_APP_ID' };
  for (const [key, variable] of Object.entries(mapping)) {
    assert(typeof publicConfig[key] === 'string' && publicConfig[key] && !/[\r\n]/.test(publicConfig[key]), `missing public Firebase ${key}`);
    console.log(`::add-mask::${publicConfig[key]}`); buildEnv[variable] = publicConfig[key];
  }
  run('pnpm', ['--filter', '@workspace/gh-brain', 'run', 'build'], { cwd: sourceRoot, env: buildEnv });
  const localImage = `lai-release:${context.runId}-${context.attempt}`;
  run('docker', ['build', '--platform', 'linux/amd64', '--file', 'artifacts/api-server/Dockerfile', '--tag', localImage, '.'], { cwd: sourceRoot });
  const container = run('docker', ['run', '--detach', '--network', 'none', '-e', `DEPLOY_GIT_SHA=${descriptor.sourceCommit}`, '-e', 'DEPLOY_TIMESTAMP=local-probe', localImage]);
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const probe = spawnSync('docker', ['exec', container, 'node', '-e', `Promise.all([fetch('http://127.0.0.1:8080/api/live').then(r=>r.json()),fetch('http://127.0.0.1:8080/api/version').then(r=>r.json())]).then(([h,v])=>{if(h.status!=='ok'||v.sha!=='${descriptor.sourceCommit}')process.exit(1)}).catch(()=>process.exit(1))`], { stdio: 'pipe', timeout: 5000 });
      if (probe.status === 0) { healthy = true; break; } await sleep(2000);
    }
    assert(healthy, 'isolated Docker health/version probe failed');
  } finally { run('docker', ['rm', '--force', container]); }
  const index = await readFile(path.join(sourceRoot, firebase.hosting.public, 'index.html'));
  const marker = { schemaVersion: 1, sourceCommit: descriptor.sourceCommit, controllerCommit: context.controllerSha, runId: context.runId, runAttempt: context.attempt, indexSha256: createHash('sha256').update(index).digest('hex') };
  await writeFile(path.join(sourceRoot, firebase.hosting.public, 'release.json'), JSON.stringify(marker) + '\n');
  await writeFile(path.join(sourceRoot, 'firebase.lai-release.json'), JSON.stringify(firebase) + '\n', { mode: 0o600 });
  await writeFile(tempPath(context, 'build.json'), JSON.stringify({ localImage, marker }), { mode: 0o600 });
  console.log('Frontend build and network-isolated Docker health/version probes passed before cloud authentication.');
}
function cloudToken() { const token = run('gcloud', ['auth', 'print-access-token', '--quiet']); assert(token && !/\s/.test(token), 'cloud token missing'); return token; }
async function cloud(url, label, method = 'GET', body) { return request(url, { label, token: cloudToken(), method, body }); }
const SERVICE_URL = 'https://us-central1-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/litigant-ai/services/api';
async function serviceSnapshot() { return assertServiceReady(await cloud(SERVICE_URL, 'Cloud Run api/us-central1/litigant-ai')); }

// Read-only credential wiring diagnostics. Secret payloads and ordinary env values
// never leave this process. The existing LAI WIF identity is used unchanged.
const CREDENTIAL_NAMES = new Set(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY',
  'RESEND_API_KEY', 'SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'ADMIN_MASTER_SECRET',
  'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT_JSON_V2']);
const CORTEX_MEMBER = 'serviceAccount:299349451575-compute@developer.gserviceaccount.com';
export function credentialBindingMetadata(service) {
  return (service.spec?.template?.spec?.containers?.[0]?.env ?? [])
    .filter(entry => CREDENTIAL_NAMES.has(entry.name))
    .map(entry => {
      const binding = entry.valueFrom?.secretKeyRef;
      return { name: entry.name, source: binding ? 'secret-manager' : 'environment',
        configured: binding ? true : typeof entry.value === 'string' && entry.value.length > 0,
        ...(binding ? { secret: binding.name, version: binding.key } : {}) };
    });
}
export function cortexRoleMetadata(policy) {
  return (policy.bindings ?? []).filter(binding => binding.members?.includes(CORTEX_MEMBER))
    .map(binding => ({ role: binding.role, conditional: !!binding.condition }));
}
export async function inspectCredentialWiring(service, read = cloud) {
  const report = { runtime: credentialBindingMetadata(service), projectAccess: null, credentials: [], inventory: 'unavailable' };
  const safeRead = async (url, label, method = 'GET', body) => {
    try { return { status: 'available', data: await read(url, label, method, body) }; }
    catch (error) { return { status: error.httpStatus === 403 ? 'permission-denied' : 'unavailable', data: null }; }
  };
  const policy = await safeRead('https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:getIamPolicy',
    'LAI project access metadata', 'POST', { options: { requestedPolicyVersion: 3 } });
  report.projectAccess = { status: policy.status, cortexRoles: policy.data ? cortexRoleMetadata(policy.data) : [] };
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const inventory = await safeRead('https://secretmanager.googleapis.com/v1/projects/litigant-ai/secrets?pageSize=100' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), 'LAI credential inventory metadata');
    report.inventory = inventory.status;
    if (!inventory.data) break;
    for (const secret of inventory.data.secrets ?? []) {
      const name = String(secret.name).split('/').pop();
      if (!CREDENTIAL_NAMES.has(name)) continue;
      const resource = 'https://secretmanager.googleapis.com/v1/projects/litigant-ai/secrets/' + name;
      const version = await safeRead(resource + '/versions/latest', 'LAI credential version metadata');
      const access = await safeRead(resource + ':getIamPolicy?options.requestedPolicyVersion=3', 'LAI credential access metadata');
      report.credentials.push({ name, version: version.data ? String(version.data.name).split('/').pop() : null,
        state: version.data?.state ?? version.status, access: access.status,
        cortexRoles: access.data ? cortexRoleMetadata(access.data) : [] });
    }
    pageToken = inventory.data.nextPageToken ?? '';
    if (!pageToken) break;
    if (page === 19) report.inventory = 'incomplete';
  }
  return report;
}

// Two exact additive payment-history indexes. Never deploy the catalog or mutate data.
export const PAYMENT_INDEX_PARENT = 'projects/litigant-ai/databases/(default)/collectionGroups/credit_transactions';
export const PAYMENT_INDEX = Object.freeze({ queryScope: 'COLLECTION', fields: Object.freeze([
  Object.freeze({ fieldPath: 'userId', order: 'ASCENDING' }),
  Object.freeze({ fieldPath: 'type', order: 'ASCENDING' }),
  Object.freeze({ fieldPath: 'createdAt', order: 'DESCENDING' }),
]) });
export const HISTORY_INDEX = Object.freeze({ queryScope: 'COLLECTION', fields: Object.freeze([PAYMENT_INDEX.fields[0], PAYMENT_INDEX.fields[2]]) });
function indexDefinition(index) {
  const { name, state, ...definition } = index;
  return definition;
}
function matchesIndex(index, expected) {
  if (index.queryScope !== expected.queryScope || (index.apiScope && index.apiScope !== 'ANY_API')) return false;
  if (index.unique === true || index.multikey === true || index.searchIndexOptions || (index.shardCount && index.shardCount !== 0) || (index.density && index.density !== 'SPARSE_ALL')) return false;
  const fields = structuredClone(index.fields ?? []);
  if (fields.at(-1)?.fieldPath === '__name__') {
    if (fields.at(-1).order !== 'DESCENDING' || Object.keys(fields.at(-1)).length !== 2) return false;
    fields.pop();
  }
  return JSON.stringify(sorted(fields)) === JSON.stringify(sorted(expected.fields));
}
export function inspectPaymentIndexSet(indexes) {
  assert(Array.isArray(indexes), 'index list required');
  const names = new Set();
  for (const index of indexes) {
    assert(typeof index.name === 'string' && index.name.startsWith(`${PAYMENT_INDEX_PARENT}/indexes/`) && /^[A-Za-z0-9_-]+$/.test(index.name.slice(`${PAYMENT_INDEX_PARENT}/indexes/`.length)), 'unexpected index resource');
    assert(!names.has(index.name), 'duplicate index resource'); names.add(index.name);
  }
  const history = indexes.filter(index => matchesIndex(index, HISTORY_INDEX));
  const matches = indexes.filter(index => matchesIndex(index, PAYMENT_INDEX));
  assert(history.length <= 1, 'ambiguous unfiltered payment-history index');
  assert(matches.length <= 1, 'ambiguous payment-history index');
  if (history[0]) assert(['READY', 'CREATING'].includes(history[0].state), 'unfiltered payment-history index needs repair; no production release');
  if (matches[0]) assert(['READY', 'CREATING'].includes(matches[0].state), 'payment-history index needs repair; no production release');
  return { history: history[0] ?? null, target: matches[0] ?? null };
}
export function inspectPaymentIndexes(indexes) {
  const result = inspectPaymentIndexSet(indexes);
  assert.equal(result.history?.state, 'READY', 'existing unfiltered payment-history index must remain READY');
  return result.target;
}
function assertIndexesPreserved(before, after) {
  for (const index of before) {
    const current = after.find(item => item.name === index.name);
    assert(current, 'an existing Firestore index disappeared; release stopped');
    assert.deepEqual(indexDefinition(current), indexDefinition(index), 'an existing Firestore index changed; release stopped');
  }
}
const INDEX_CATALOG_PARENT = 'projects/litigant-ai/databases/(default)/collectionGroups/-';
let paymentIndexReadParent = PAYMENT_INDEX_PARENT;
export async function paymentIndexes(read = cloud, useCatalog = false) {
  assert.equal(typeof useCatalog, 'boolean', 'invalid index read scope');
  const indexes = []; let pageToken = '';
  // Match Firebase's official listIndexes implementation when a deployment's
  // Firestore API requires the database-wide metadata catalog. POST stays exact.
  let parent = useCatalog ? INDEX_CATALOG_PARENT : read === cloud ? paymentIndexReadParent : PAYMENT_INDEX_PARENT;
  for (let page = 0; page < 100; page++) {
    // Firestore currently accepts only its default page size (0). Keep returned
    // page tokens and the bounded loop without sending an unsupported pageSize.
    const readPage = () => read(`https://firestore.googleapis.com/v1/${parent}/indexes${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`, 'read payment-history indexes');
    let data;
    try { data = await readPage(); }
    catch (error) {
      if (page !== 0 || parent !== PAYMENT_INDEX_PARENT || error.httpStatus !== 400 || error.apiStatus !== 'INVALID_ARGUMENT') throw error;
      console.log(`Firestore specific-collection list INVALID_ARGUMENT: ${error.safeDetail ?? 'No message returned'}. Checking the official read-only index catalog.`);
      parent = INDEX_CATALOG_PARENT;
      data = await readPage();
      if (read === cloud) paymentIndexReadParent = parent;
    }
    assert(Array.isArray(data.indexes ?? []), 'invalid Firestore index response');
    indexes.push(...(data.indexes ?? []));
    if (!data.nextPageToken) {
      const prefix = 'projects/litigant-ai/databases/(default)/collectionGroups/';
      for (const index of indexes) assert(typeof index?.name === 'string' && index.name.startsWith(prefix) && /^[^/]+\/indexes\/[A-Za-z0-9_-]+$/.test(index.name.slice(prefix.length)), 'unexpected index catalog resource');
      return indexes.filter(index => index.name.startsWith(`${PAYMENT_INDEX_PARENT}/indexes/`));
    }
    assert(typeof data.nextPageToken === 'string' && data.nextPageToken !== pageToken, 'invalid Firestore index pagination');
    pageToken = data.nextPageToken;
  }
  fail('Firestore index pagination exceeded bound');
}
export function paymentIndexMetadata(indexes) {
  const enumValue = value => value === undefined ? '<absent>' : typeof value === 'string' && /^[A-Z_]{1,80}$/.test(value) ? value : '<unrecognized>';
  const knownFields = new Set(['userId', 'type', 'createdAt', '__name__']);
  return {
    count: indexes.length,
    truncated: indexes.length > 100,
    indexes: indexes.slice(0, 100).map(index => ({
      state: enumValue(index.state), queryScope: enumValue(index.queryScope),
      apiScope: enumValue(index.apiScope), density: enumValue(index.density),
      unique: index.unique === true, multikey: index.multikey === true,
      searchIndex: Boolean(index.searchIndexOptions), nonzeroShards: Boolean(index.shardCount),
      fieldCount: Array.isArray(index.fields) ? index.fields.length : null,
      fields: (Array.isArray(index.fields) ? index.fields : []).slice(0, 20).map(field => ({
        fieldPath: knownFields.has(field.fieldPath) ? field.fieldPath : '<other-field>',
        order: enumValue(field.order), arrayConfig: enumValue(field.arrayConfig),
        extraProperties: Object.keys(field).filter(key => !['fieldPath', 'order', 'arrayConfig'].includes(key)).length,
      })),
      matchesHistory: matchesIndex(index, HISTORY_INDEX), matchesTarget: matchesIndex(index, PAYMENT_INDEX),
    })),
  };
}
export async function createRequiredPaymentIndex(kind, write = cloud) {
  assert(['history', 'target'].includes(kind), 'unapproved payment index kind');
  if (kind === 'history') return write(`https://firestore.googleapis.com/v1/${PAYMENT_INDEX_PARENT}/indexes`, 'create exact unfiltered payment-history index', 'POST', HISTORY_INDEX);
  return write(`https://firestore.googleapis.com/v1/${PAYMENT_INDEX_PARENT}/indexes`, 'create exact payment-history index', 'POST', PAYMENT_INDEX);
}
export async function paymentHistoryIndexGate(context, descriptor, { list = paymentIndexes, create = createRequiredPaymentIndex, recheck, pause = sleep, polls = 120, delayMs = 10000 } = {}) {
  if (descriptor.action === 'inspect') assert.equal(descriptor.sourceCommit, context.controllerSha, 'inspection source mismatch');
  validateDescriptor(descriptor.action === 'inspect' ? { ...descriptor, sourceCommit: null } : descriptor, context.controllerSha);
  assert(Number.isSafeInteger(polls) && polls > 0 && polls <= 120, 'invalid index wait bound');
  const before = await list();
  let indexes = inspectPaymentIndexSet(before);
  if (descriptor.action === 'inspect') {
    console.log(`Read-only index plan: credit_transactions COLLECTION userId ASC, createdAt DESC is ${indexes.history?.state ?? 'MISSING'}; userId ASC, type ASC, createdAt DESC is ${indexes.target?.state ?? 'MISSING'}. Deployment creates only missing planned indexes and waits for both READY; existing indexes are preserved.`);
    return { state: indexes.target?.state ?? 'MISSING', historyState: indexes.history?.state ?? 'MISSING', created: false };
  }
  assert(typeof recheck === 'function', 'release evidence recheck required');
  let created = false;
  for (const kind of ['history', 'target']) {
    if (!indexes[kind]) {
      await recheck();
      console.log(`Release stage: creating only the approved ${kind} payment-history index; API and Hosting unchanged.`);
      const operation = await create(kind);
      assert(operation && !operation.error, 'payment-history index creation failed');
      created = true;
    }
  }
  for (let attempt = 0; attempt < polls; attempt++) {
    const current = await list();
    assertIndexesPreserved(before, current);
    indexes = inspectPaymentIndexSet(current);
    if (indexes.history?.state === 'READY' && indexes.target?.state === 'READY') {
      await recheck();
      console.log(`Both payment-history indexes READY: ${indexes.history.name}, ${indexes.target.name}; all existing indexes preserved.`);
      return { state: 'READY', historyState: 'READY', created, name: indexes.target.name, historyName: indexes.history.name };
    }
    if (attempt + 1 < polls) await pause(delayMs);
  }
  fail('At least one payment-history index is not READY yet; API and Hosting unchanged. Recheck existing builds before retrying; do not delete or recreate them.');
}

async function permissions(url, names, label) {
  const answer = await cloud(url, `${label}:testIamPermissions`, 'POST', { permissions: names });
  const missing = names.filter(name => !(answer.permissions ?? []).includes(name));
  assert(!missing.length, `POST ${label}:testIamPermissions HTTP 200; missing permissions: ${missing.join(', ')}`);
}
export function runtimeIdentityEvidence(context, service) {
  const serviceAccount = service.spec?.template?.spec?.serviceAccountName;
  assert(typeof serviceAccount === 'string' && /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.gserviceaccount\.com$/.test(serviceAccount), 'valid runtime identity required');
  sha(context.controllerSha, 'runtime evidence source');
  runPin({ runId: context.runId, runAttempt: context.attempt }, 'runtime evidence');
  return { schemaVersion: 1, projectId: 'litigant-ai', region: 'us-central1', service: 'api',
    serviceAccount, sourceCommit: context.controllerSha, runId: context.runId, runAttempt: context.attempt };
}
async function preflight(context) {
  const project = await cloud('https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai', 'Cloud Resource Manager project');
  assert.equal(project.projectId, 'litigant-ai'); assert.equal(project.lifecycleState, 'ACTIVE');
  const firebase = await cloud('https://firebase.googleapis.com/v1beta1/projects/litigant-ai', 'Firebase project');
  assert.equal(firebase.projectId, 'litigant-ai');
  const site = await cloud('https://firebasehosting.googleapis.com/v1beta1/projects/litigant-ai/sites/litigant-ai', 'existing Firebase Hosting site');
  assert(['projects/litigant-ai/sites/litigant-ai', 'projects/781960492360/sites/litigant-ai'].includes(site.name), 'wrong Hosting site');
  const service = await serviceSnapshot();
  await permissions('https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions', ['run.services.get', 'run.services.update', 'run.operations.get', 'firebase.projects.get', 'firebasehosting.sites.get', 'firebasehosting.sites.update', 'serviceusage.services.use'], 'LAI project');
  const account = service.spec.template.spec.serviceAccountName;
  assert(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.gserviceaccount\.com$/.test(account), 'invalid existing runtime service account');
  await permissions(`https://iam.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(account)}:testIamPermissions`, ['iam.serviceAccounts.actAs'], 'existing runtime service account');
  await permissions('https://artifactregistry.googleapis.com/v1/projects/litigant-ai/locations/us/repositories/gcr.io:testIamPermissions', ['artifactregistry.repositories.get', 'artifactregistry.repositories.downloadArtifacts', 'artifactregistry.repositories.uploadArtifacts'], 'existing LAI image repository');
  await permissions('https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions', ['datastore.indexes.list', 'datastore.indexes.create'], 'LAI exact payment-history index');
  await writeFile(tempPath(context, 'runtime.json'), JSON.stringify({ fingerprint: runtimeFingerprint(service), resourceVersion: service.metadata.resourceVersion, sourceCommit: context.controllerSha }), { mode: 0o600 });
  console.log('LAI_RUNTIME_IDENTITY '+JSON.stringify({projectId:'litigant-ai',service:'api',serviceAccount:account}));
  console.log('Read-only cloud preflight passed: existing project, Firebase site, ready API, 100% latest-revision traffic and deploy permissions.');
  return service;
}
async function sameRuntime(before, resourceVersion) {
  const current = await serviceSnapshot();
  assert.equal(runtimeFingerprint(current), runtimeFingerprint(before), 'runtime or traffic drift detected; stopped');
  if (resourceVersion !== undefined) assert.equal(current.metadata.resourceVersion, resourceVersion, 'concurrent service update detected; stopped');
  return current;
}
async function verifyApi(url, sourceCommit) {
  const health = await request(`${url}/api/health`, { label: 'API health' }); assert.equal(health.status, 'ok');
  const version = await request(`${url}/api/version`, { label: 'API version' }); assert.equal(version.sha, sourceCommit, 'API source mismatch');
}
async function verifyHosting(marker, sourceRoot) {
  const expectedIndex = await readFile(path.join(sourceRoot, 'artifacts/gh-brain/dist/public/index.html'));
  for (const origin of ORIGINS) {
    const cacheBust = `?lai_release=${marker.controllerCommit}`;
    const index = await request(`${origin}/${cacheBust}`, { label: `${origin} frontend index`, raw: true });
    assert.equal(createHash('sha256').update(index).digest('hex'), marker.indexSha256, `${origin}: index differs from build`);
    const explicitIndex = await request(`${origin}/index.html${cacheBust}`, { label: `${origin} explicit index`, raw: true });
    assert(explicitIndex.equals(expectedIndex), `${origin}: explicit index differs from build`);
    const release = await request(`${origin}/release.json${cacheBust}`, { label: `${origin} release marker` });
    assert.deepEqual(release, marker, `${origin}: release marker mismatch`);
    await verifyApi(`${origin}/api-server`, marker.sourceCommit);
  }
}
export function validateSavedCanon(document) {
  const fields = document?.fields;
  assert(typeof fields?.text?.stringValue === 'string' && fields.text.stringValue.trim(), 'Saved Canon text is missing; configure it before releasing');
  assert(typeof fields?.version?.stringValue === 'string' && fields.version.stringValue.trim(), 'Saved Canon version is missing; configure it before releasing');
}

async function release() {
  const { context, descriptor } = await loadPlan();
  const before = await preflight(context);
  if (descriptor.action !== 'migrate-credentials') {
    validateSavedCanon(await cloud('https://firestore.googleapis.com/v1/projects/litigant-ai/databases/(default)/documents/system_config/conscience', 'read required saved Canon'));
    console.log('Read-only Canon preflight passed: saved instructions and version are present.');
    await permissions('https://cloudresourcemanager.googleapis.com/v1/projects/litigant-ai:testIamPermissions', ['firebaserules.releases.get', 'firebaserules.releases.update', 'firebaserules.rulesets.get', 'firebaserules.rulesets.create'], 'LAI feedback rules');
    const rulesRoot = descriptor.action === 'inspect' ? '.' : 'release-source';
    await inspectFeedbackRules(cloud, await readFile(path.join(rulesRoot, 'firestore.rules'), 'utf8'));
    console.log('Read-only rules preflight passed: exact feedback-only tightening, no rules drift.');
  }
  if (descriptor.action === 'inspect') {
    await writeFile(tempPath(context, 'identity.json'), JSON.stringify(runtimeIdentityEvidence(context, before)) + '\n', { mode: 0o600 });
    console.log('LAI_CREDENTIAL_WIRING ' + JSON.stringify(await inspectCredentialWiring(before)));
    let migrationPending=true;
    try { migrationValues(before); } catch { migrationPending=false; }
    if(migrationPending) {
      await prepareMigration(before,cloud);
      console.log('LAI_CREDENTIAL_ACCESS_PREFLIGHT '+JSON.stringify({ready:true,scope:'all-project-credentials',mutation:false}));
    }
    const indexes = await paymentIndexes();
    console.log(`Read-only payment-index collection metadata: ${JSON.stringify(paymentIndexMetadata(indexes))}`);
    const catalog = await paymentIndexes(cloud, true);
    console.log(`Read-only payment-index catalog metadata: ${JSON.stringify(paymentIndexMetadata(catalog))}`);
    await paymentHistoryIndexGate(context, descriptor, { list: async () => indexes });
    console.log(`Inspection complete. Approve this exact cloud-preflight run ${context.runId}, attempt ${context.attempt}, SHA ${context.controllerSha} in the private Engine before a descriptor-only deployment commit.`);
    return;
  }
  if (descriptor.action === 'migrate-credentials') {
    const result=await migrateCredentials({before,read:cloud,
      assertCurrent:()=>verifyCiAndEvidence(context,descriptor),readRuntime:serviceSnapshot,
      updateRuntime:async replacement=>{
        await cloud(SERVICE_URL,'replace approved runtime credential bindings','PUT',replacement);
        await retryRead(async()=>{
          const current=await serviceSnapshot();
          assert(current.status.latestReadyRevisionName!==before.status.latestReadyRevisionName,'Credential revision is not ready yet');
          assert(String(current.status.observedGeneration)===String(current.metadata.generation),'Runtime update not reconciled yet');
        });
      },
      fingerprint:runtimeFingerprint,assertReady:assertServiceReady,
      verifyHealth:async url=>{
        const source=before.spec.template.spec.containers[0].env.find(entry=>entry.name==='DEPLOY_GIT_SHA')?.value;
        assert(SHA.test(source),'Existing application provenance required');
        await retryRead(()=>verifyApi(url,source));
      },
    });
    console.log('LAI_CREDENTIAL_MIGRATION '+JSON.stringify(result));
    return;
  }
  const built = JSON.parse(await readFile(tempPath(context, 'build.json'), 'utf8'));
  assert.equal(built.marker.sourceCommit, descriptor.sourceCommit); assert.equal(built.marker.controllerCommit, context.controllerSha);
  let expectedResourceVersion = before.metadata.resourceVersion;
  const recheck = async () => { await verifyCiAndEvidence(context, descriptor); await sameRuntime(before, expectedResourceVersion); };
  await recheck();
  await paymentHistoryIndexGate(context, descriptor, { recheck });
  await recheck();
  run('gcloud', ['auth', 'configure-docker', 'gcr.io', '--quiet']);
  const tag = `gcr.io/litigant-ai/api:lai-${descriptor.sourceCommit}-${context.runId}-${context.attempt}`;
  run('docker', ['tag', built.localImage, tag]);
  await recheck();
  console.log('Release stage: image publication attempted; production API and Hosting unchanged.');
  run('docker', ['push', tag]);
  console.log('Release stage: image published; production API and Hosting unchanged.');
  const image = assertAllowedImage(run('docker', ['inspect', '--format={{index .RepoDigests 0}}', tag]));
  await recheck();
  assert.equal(inspectPaymentIndexes(await paymentIndexes())?.state, 'READY', 'payment-history index is no longer READY; API unchanged');
  const deployedAt = new Date().toISOString();
  console.log('Release stage: API update attempted; Hosting unchanged.');
  run('gcloud', ['run', 'services', 'update', 'api', '--project=litigant-ai', '--region=us-central1', `--image=${image}`, `--update-env-vars=DEPLOY_GIT_SHA=${descriptor.sourceCommit},DEPLOY_TIMESTAMP=${deployedAt}`, '--quiet', '--format=none']);
  const after = await sameRuntime(before);
  expectedResourceVersion = after.metadata.resourceVersion;
  assert.equal(after.spec.template.spec.containers[0].image, image, 'runtime image differs from pushed digest');
  const deployedEnv = after.spec.template.spec.containers[0].env ?? [];
  assert.equal(deployedEnv.find(v => v.name === 'DEPLOY_GIT_SHA')?.value, descriptor.sourceCommit);
  assert.equal(deployedEnv.find(v => v.name === 'DEPLOY_TIMESTAMP')?.value, deployedAt);
  await retryRead(() => verifyApi(after.status.url, descriptor.sourceCommit));
  console.log('Release stage: API update complete and verified; Hosting unchanged.');
  await recheck(); // Scope, evidence, Main and runtime checks immediately before Hosting mutation.
  const sourceRoot = path.resolve('release-source');
  const config = JSON.parse(await readFile(path.join(sourceRoot, 'firebase.lai-release.json'), 'utf8'));
  const original = validateHostingConfig(JSON.parse(await readFile(path.join(sourceRoot, 'firebase.json'), 'utf8')));
  assert.deepEqual(config, original, 'generated hosting-only config changed');
  console.log('Release stage: Hosting update attempted; API already updated and verified.');
  run('pnpm', ['exec', 'firebase', 'deploy', '--only', 'hosting', '--project', 'litigant-ai', '--config', 'firebase.lai-release.json', '--non-interactive'], { cwd: sourceRoot });
  console.log('Release stage: Hosting update complete; verifying public origins.');
  await sameRuntime(before, expectedResourceVersion);
  await verifyCiAndEvidence(context, descriptor);
  await retryRead(() => verifyHosting(built.marker, sourceRoot));
  console.log('Release stage: applying reviewed feedback rules after API and frontend verification.');
  await deployFeedbackRules({read: cloud, write: cloud, content: await readFile(path.join(sourceRoot, 'firestore.rules'), 'utf8'), assertCurrent: recheck});
  await sameRuntime(before, expectedResourceVersion);
  await verifyCiAndEvidence(context, descriptor);
  assert.equal(inspectPaymentIndexes(await paymentIndexes())?.state, 'READY', 'payment-history index is no longer READY at final verification');
  console.log(`LAI release verified on all three origins; source ${descriptor.sourceCommit}, controller ${context.controllerSha}.`);
}
async function main() {
  const command = process.argv[2];
  assert(['plan', 'prepare', 'release'].includes(command), 'expected plan, prepare or release');
  await ({ plan, prepare, release }[command])();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`LAI release stopped: ${error.message}`); process.exitCode = 1; });
}
