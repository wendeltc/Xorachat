# Feature Specification: Workspace Foundation

**Feature Branch**: `001-workspace-foundation`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Workspace foundation for the Rust rewrite of Xorachat. The current Electron + PeerJS app (index.html, xorachat-desktop/, xorachat-desktop.zip and the AppImage workflow) moves to legacy/ as a behavior reference, and PROJETO.md moves to docs/PROJETO.md. A new Cargo workspace is created with four crates (xora-core, xora-media, xora-app, xora-token) where xora-app and xora-token compile to binaries that start and exit cleanly. The project version is 0.1.0. A CI pipeline builds the whole workspace on Windows and Linux for every pull request and push to main. The README explains in English what Xorachat is and how to build it on each platform. Success: a fresh clone builds on Windows 10/11, Debian stable and Fedora with the documented prerequisites, and CI is green on both platforms."

## Clarifications

### Session 2026-10-11

- Q: Should the CI pipeline also build on Fedora? → A: No. CI covers Windows and Debian 13 only;
  Fedora is built manually once in this feature and the result is recorded in the PR.

## User Scenarios & Testing *(mandatory)*

Actors are the contributors of the Xorachat project (the developers in the friend group). End users
see no change in this feature.

### User Story 1 - Build the new project from a fresh clone (Priority: P1)

A contributor clones the repository on Windows 10/11, Debian stable or Fedora, installs the
prerequisites listed in the README and builds the whole project with a single documented command.
The desktop app and the token service both start, report their name and version 0.1.0, and exit
cleanly.

**Why this priority**: every later feature (voice, chat, screen sharing) depends on a project that
builds on all target platforms; the heavy real-time media dependency is the main build risk and must
be proven first.

**Independent Test**: on a clean machine of each platform, follow only the README, run the build
command, then run each program and confirm it prints its name and version and exits with success.

**Acceptance Scenarios**:

1. **Given** a fresh clone on Windows 10/11 with the documented prerequisites, **When** the
   contributor runs the documented build command, **Then** the build finishes without errors.
2. **Given** a fresh clone on Debian stable or Fedora with the documented prerequisites, **When** the
   contributor runs the documented build command, **Then** the build finishes without errors.
3. **Given** a successful build, **When** the contributor runs the desktop app or the token service,
   **Then** each one reports its name and version 0.1.0 and exits with a success status.

---

### User Story 2 - Automatic build check on every change (Priority: P2)

When a contributor opens a pull request or a change lands on `main`, an automated pipeline builds
the whole project on Windows and on Linux and reports pass or fail on the pull request.

**Why this priority**: the constitution requires every PR to build on both platforms before merge;
without this check, platform breakages are found late.

**Independent Test**: open a pull request with this feature and confirm both platform jobs run and
pass; push a deliberately broken change on a scratch branch and confirm the check fails.

**Acceptance Scenarios**:

1. **Given** a pull request targeting `main`, **When** it is opened or updated, **Then** a Windows
   build and a Linux build run and their status is visible on the pull request.
2. **Given** a change merged into `main`, **When** it lands, **Then** the same builds run on `main`.
3. **Given** a change that breaks the build or introduces lint warnings, **When** the pipeline runs,
   **Then** it fails and the pull request shows the failure.

---

### User Story 3 - Legacy app preserved as reference (Priority: P3)

A contributor looking for how the current app behaves (rooms, participant list, speaking indicator,
dark layout) finds the complete previous web and desktop app in a `legacy/` folder, and the project
document in `docs/PROJETO.md`. The old AppImage release pipeline no longer runs.

**Why this priority**: keeps the behavior reference without mixing it with the new code; it does not
block building the new project.

**Independent Test**: browse the repository and confirm the old files exist under `legacy/` with
their history, `docs/PROJETO.md` exists, the root contains only the new project files, and pushing a
`v*` tag no longer triggers the AppImage build.

**Acceptance Scenarios**:

1. **Given** the repository after this feature, **When** a contributor opens `legacy/`, **Then** it
   contains the previous web page, the previous desktop wrapper and its archive.
2. **Given** a file moved to `legacy/`, **When** the contributor views its history, **Then** the
   commits from before the move are still reachable.
3. **Given** the repository root, **When** listed, **Then** no previous-app files remain there and the
   project document lives at `docs/PROJETO.md`.

---

### Edge Cases

- A required prerequisite is missing on the contributor's machine: the build fails with an error
  that names the missing tool or library, and the README lists it.
- The Linux distribution ships a compiler older than required: the README states the minimum version
  and how to obtain it on Debian stable and Fedora.
- The first build is slow because large prebuilt media libraries are downloaded: the README warns
  about it; the pipeline reuses cached build artifacts between runs.
- The pipeline runs on a fork's pull request: the build still runs without needing any secret.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain one buildable project with four components: `xora-core`
  (session and room logic, no UI), `xora-media` (OS-specific capture), `xora-app` (desktop program)
  and `xora-token` (server program).
- **FR-002**: The dependency direction MUST be `xora-app` → `xora-core` → `xora-media`; `xora-token`
  MUST NOT depend on the desktop components.
- **FR-003**: The project version MUST be 0.1.0, defined in a single place and inherited by all four
  components.
- **FR-004**: `xora-app` and `xora-token` MUST each start, print their name and version, and exit
  with a success status when run without arguments.
- **FR-005**: `xora-core` MUST already include the real-time media dependency chosen in PROJETO.md, so
  its build cost and platform requirements are validated by this feature.
- **FR-006**: The whole project MUST build with one documented command on Windows 10/11, Debian
  stable and Fedora (x86_64).
- **FR-007**: An automated pipeline MUST build the whole project and run the linter with warnings
  treated as errors on Windows and Linux for every pull request to `main` and every push to `main`.
- **FR-008**: The Linux pipeline job MUST build on an environment compatible with Debian stable.
- **FR-009**: The previous app files (`index.html`, `xorachat-desktop/`, `xorachat-desktop.zip`) MUST
  move to `legacy/` preserving their history, and the AppImage workflow MUST be removed from the
  active pipelines and kept under `legacy/` for reference.
- **FR-010**: `PROJETO.md` MUST move to `docs/PROJETO.md`, and references to its location (including
  the constitution) MUST be updated.
- **FR-011**: The README MUST be in English and explain what Xorachat is, the repository layout, the
  prerequisites per platform (Windows, Debian, Fedora) and how to build and run both programs.
- **FR-012**: Build outputs MUST be excluded from version control.

### Key Entities

- **Component**: one of the four buildable units, with a name, a role and allowed dependencies.
- **Project version**: the single version value (0.1.0) shared by all components.
- **Build pipeline**: the automated check with one job per platform and a pass/fail result per change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor following only the README builds the project successfully on each of the
  three target platforms (Windows 10/11, Debian stable, Fedora) on the first attempt; Windows and
  Debian are proven by CI, Fedora by the manual build recorded in the PR.
- **SC-002**: Both programs report version 0.1.0 and exit successfully on all three platforms.
- **SC-003**: The pull request for this feature shows a passing build on both Windows and Linux.
- **SC-004**: With warm caches, the pipeline completes in under 30 minutes per platform.
- **SC-005**: 100% of the previous app files are reachable under `legacy/` with their prior history.

## Assumptions

- The pipeline only covers Windows and Debian-compatible Linux. Fedora is validated by one manual
  build from a fresh clone during this feature, with the outcome (Fedora release, success or error)
  recorded in the PR description.
- Packaging (.zip, .deb, .rpm) and release publishing are out of scope; they belong to feature 008.
- No automated tests are written (constitution Principle III); validation is manual via quickstart.
- The license stays MIT, as declared by the previous desktop app.
- The pinned toolchain and library versions are the ones listed in PROJETO.md and the constitution.
