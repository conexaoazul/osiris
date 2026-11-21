# BlueOps OSIRIS — homologation handoff (review only)

> Status: **NO-GO for deployment**. This directory is a review artifact, not an approved release.
> No merge, deployment, public DNS, ingress route, node-label mutation or production access is implied by this document.

## Scope

Propose a one-replica OSIRIS service in an internal Swarm overlay network with no published ports.
The first stage intentionally excludes the optional RECON scanner, API/model keys, OI forecasts, external webhooks and all write-capable agent automations.
The sample image is required to be an immutable, inspected digest.
The sample node label `osiris_homolog=true` is **not** provisioned by this change and must not be added until a separately approved operational change.

The manifest contains **no** external ingress or SSO configuration. Adding Traefik/Cloudflare/Keycloak access must happen through the approved, private infrastructure configuration and be tested on **all** API paths, including `/api/mcp`.

This repository is public. Never commit internal IPs, hostnames, endpoint IDs, secret names, tokens, cookies, actual capacity reports or incident details here.

## Important upstream considerations

- The repository copy must be compared with the current upstream `simplifaisoul/osiris` before building: it may lag upstream, including security fixes.
- The upstream `docker-compose.yml` is not a suitable Swarm stack: it publishes ports, references an external `umami_default` network and includes extra Nginx/intel containers. This proposal uses an independent file.
- Some upstream instructions refer to `.env.template`, but the checked-in example is `.env.example`. Do not copy credentials into the repository.
- **Do not run `deploy.sh`**. The legacy script stages all changes, pushes directly to `master`, connects over SSH as root, and restarts Docker Compose. It has no approval gate or rollback guarantees.
- `/api/health` is process liveness, **not** evidence of live upstream feeds. `/api/stats` aggregates external sources and must not be polled rapidly.
- The frontend map uses browser WebGL; a dedicated GPU on the Swarm host is not required for this first-stage deployment.

## Read-only preflight and required evidence

| Gate | Read-only evidence to capture | Pass criteria |
| --- | --- | --- |
| G0: source and supply chain | Compare pinned source with upstream; review dependency vulnerabilities, Dockerfile and image provenance | No unresolved critical findings; source SHA and image digest recorded privately |
| G1: infrastructure | Manager quorum, node readiness, available RAM/CPU, existing workloads and ingress topology | Swarm control healthy and scheduling does not endanger priority production or CI |
| G2: isolation | Render `swarm.yml`; review ports, networks, permissions and placement | No exposed ports; isolated network; node placement explicitly approved |
| G3: smoke and resources | One-replica service, restart/OOM counters, `/api/health`, chosen feed endpoints, browser map | Stable restart count, resources within measured budget, key feeds demonstrably working |
| G4: access control | Authorized and unauthorized browser/API/MCP requests through private protected ingress | SSO applied to all methods/paths; unauthenticated callers denied; audit logs present |
| G5: operations | Monitoring, upstream failure handling, rollback test, ownership and escalation | Rollback reproducible and no new noisy alert fan-out |

The initial 1 vCPU / 1.5 GiB memory limit and 0.25 vCPU / 512 MiB reservation in the example are **untested estimates**, not measured requirements. Do not deploy if measured headroom is insufficient.

## Configuration and validation

`OSIRIS_IMAGE` must reference a reviewed immutable digest, such as
`ghcr.io/conexaoazul/osiris@sha256:<reviewed-digest>`. Never substitute `latest` for an approved artifact.

In a CI environment with Docker available, validate the template without deploying:

```bash
export OSIRIS_IMAGE=ghcr.io/conexaoazul/osiris:manifest-syntax-only
docker compose -f deploy/blueops-osiris/swarm.yml config --quiet
docker stack config --compose-file deploy/blueops-osiris/swarm.yml >/dev/null
```

The non-digest example above is **only** for syntax validation. Never use it to start a workload.

After all gates pass and a recorded GO exists, use a private change/runbook to add the scheduler label and, separately, protected ingress. Deploy **only** the vetted image digest through the normal change process. Do not route MCP or web APIs publicly before G4.

## Rollback and ownership

Keep the previous image digest and last known-good stack definition in the private release record. If health, authentication, memory, or feed quality regresses, stop exposure and roll back using the approved Swarm deployment procedure. Capture service states and monitoring evidence, then request a fresh GO before resuming.

Evidence for a release decision: source SHA; immutable image digest; CI run; capacity/quorum snapshot; tests; ingress authorization matrix; smoke logs; rollback test; named operator; change window; explicit GO/NO-GO.

## Follow-up integration ideas (not included in this PR)

1. Read-only OSINT enrichment in Security & DR Guardian.
2. Curated MCP tools for BlueOps agents with budgets and audit logs.
3. n8n workflows with caching, deduplication, authorization and egress controls.
4. RECON active scanning in a separate network/worker, only for explicitly authorized targets.

No external notifications, scanners, production secrets, DB migrations, Odoo changes or deploys are part of this proposal.
