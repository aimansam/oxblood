# Running a team competition

A drill can hold up to **20 players in 2, 4 or 6 teams**. Teams swap sides between rounds, so every
team attacks once and defends once; points from all rounds are added up.

## Before the event
1. **Create the exercise** from an organization (Organizations → Create exercise). The wizard's
   **Format** step decides how it is played, before anything is built:
   - **Free play**: Red and Blue on one shared range.
   - **Team competition**: 2, 4 or 6 teams, 1 or 2 rounds (sides swapped), and the range layout: one
     shared range, or one copy per match. The step shows the memory the choice needs against what the
     node has free (the same check Prepare uses) and refuses *one range per match* for a scenario whose
     router cannot make copies. The layout cannot change once a range exists.
   Teams and rounds are created in the same step, so there is nothing to set up by hand afterwards.
2. **Add players while the range builds.** The Provision step shows the build progress and, beside it,
   the same *Add players* tools as the **Players** page: *Create one link for every team* (one link per
   team, seats from the roster size), *Paste names* and *Test players*. You can also do this later on the
   Players page, which shows how many seats are filled and what Start still needs.
   - **Invite link**: pick a team, set the seats and how long it is valid. Each person opens the link,
     picks a username and password, and lands in that team. A used-up link disappears from the list.
   - **Paste names** (admins): one name per line, pick a team; each gets an account with a generated
     password, enrolled at once. Copy the sheet or download the CSV before leaving the page, because the
     passwords are not shown again. Hand each player their username and password. **The first time they
     sign in they must choose their own password** (at least 10 characters, not their username); until
     they do, nothing else in the app is available to them.
   - **Test players** (admins): one Red and one Blue test account for a dry run.
   Existing accounts can still be added from the team cards.
3. **Competition → Rounds**: *Plan 2 rounds*. Round 1 has the first half of the teams as red and the
   second half as blue; round 2 swaps them. Optionally set a **freeze time** for each round.
4. Prepare and start the exercise as usual (Exercises → Prepare range, then Start).

## During a round
- **Start round** makes the team sides live: each player sees the machines of their team's side.
- Players submit flags on the live map. A flag scores **once per team per round**, only for the side
  the team plays, with the usual time decay. The first team to capture a flag in a round gets a
  25% bonus. More than 10 attempts a minute are refused.
- Referees use **Scoreboard and referee** to add or remove points. A written reason is mandatory and
  every change stays in the ledger with the referee's name and time.
- After a round's **freeze time**, players see the scoreboard as it was at that moment. Referees
  always see live points. Finishing the round reveals everything.
- Ties are broken by whichever team reached its score first.

## One range per match
By default every team shares one range. With 4 or 6 teams the Players page offers **One range per match**
(choose it before preparing; it cannot change once a range exists). Teams are paired as the side swap
pairs them (Alpha with Charlie, Bravo with Delta, ...) and each pair gets its own copy of the range:
VLANs shifted by 20 per copy, VM names prefixed `M2-`, `M3-`, and its own snapshot baselines. Preparing
builds the copies one after another, stopping the drill stops all of them, and **Reset range** resets all
of them. A player's machine list and console follow their team's copy; referees can open any copy.

Memory scales with the number of matches. Preparing first checks the scenario's RAM times the match
count against what the node has free and refuses with the numbers before anything is built (it does
not block when the node cannot report its memory). A scenario whose router is an OPNsense image cannot make copies (its VLANs are
fixed inside the image) and preparation fails with that message.

Flags then become **per team**: each team's value is planted only on its own copy. Submitting another
team's value scores nothing and adds a zero-point "possible flag sharing" note to the ledger. Flags with
no machine, and flags that are not red/blue, keep one value for everyone.

## Flags per round
Starting a round gives every flag that lives on a machine a new value, `FLAG{<name>_r<round>_<hex>}`,
derived from a per-drill secret. The value is written to the machine first and saved only when that
worked, so a flag whose planting failed keeps its old value (the card then offers **Re-plant flags**).
Flags with no machine, or drills with no prepared range, are left alone. Run **Reset range** before the
round: a reset rolls the machines back to their baseline, which holds the scenario's original files.
A player who submits a previous round's value is told it is from an earlier round.

## First sign-in with a handed-out password
A password generated for a player (paste names) is temporary. Signing in with it gives a token that can
only change the password (15 minutes, no access to any exercise data); the web app shows *Choose your
password* and nothing else until it is done. Then the player gets a normal session, and the handed-out
password stops working. Test players keep the password you were shown, since they are throwaway, and
invitation links let the player choose a password from the start. A wrong current password answers 400
(not 401, which the app reads as an expired session).

## Accounts are destroyed after cleanup
Accounts created *for an exercise* (invite link, pasted names, test players) are marked with it. When the
exercise is stopped or cancelled and its range is cleaned up, they are **destroyed**, unless you untick
*Destroy the accounts made for this exercise* (in the wizard's Format step, or on the Players page).

- Accounts picked from the existing list are never removed, nor any account enrolled in another live
  exercise.
- Deleting an account also deletes that player's own submissions and scores. The team ledger keeps its
  points (only the link to the player is cleared), and a **final roster** (username, side, team, points)
  is saved on the exercise first and shown on the Players page.
- A failed prepare that is retried does not remove anything: the exercise goes on.
- An admin can destroy the accounts of a finished exercise by hand (*Destroy the accounts now*).
- Sessions already issued stay valid until they expire (8 hours) but lose access to the exercise, since
  the enrolment is gone.

## Captains
Each team has one captain: the first player added is elected automatically, and a referee can change
it on the Players page ("Make captain"). When the captain leaves the team, the next member takes over;
an empty team has none. While a team plays **Blue**, only its captain can submit answers; the others
see who the captain is. **Red** submissions are open to every member (the per-minute limit still
applies). A team without a valid captain has no restriction.

## Between rounds
Finish the round, then press **Reset range** on the Rounds tab (or `POST /api/v2/drills/{id}/range/reset`).
Every machine rolls back to its `clean-baseline` snapshot, boots, and is checked; the drill stays as it
is. The next round cannot start while the reset is running or after it failed. Starting a round also
requires the earlier ones to be finished.

Reset needs snapshot baselines for every machine. Set `provisioning.auto_baseline: true` in the
scenario and the first prepare builds them (see `examples/scenarios/README.md`). A range cloned
without baselines cannot be reset in place; the reset refuses and names the machines.

## What is not automatic yet
- **Flags are per round, not per team.** Starting a round plants fresh values on the machines (guest
  agent) and saves them; round 1's values stop scoring. Teams that attack the same machine in the same
  round still share its value. Per-team values need one range copy per match.
- **The reset check stops at the network:** after a reset it waits (up to 150 s) for every guest agent
  to report the address the scenario gives that machine, and fails naming the machine otherwise. The
  OPNsense router has no agent and is skipped. It does not test that services answer; do that from
  the Blue workstation before the first round.
- **Blue-team detection points** are awarded by a referee ("Detection" in the referee form); nothing
  scores blue automatically from alerts.
- **Flags are fixed strings**, the same for every team. Teams that share a flag will both score it;
  use the ledger and rate limit to spot this, and keep the rules of engagement written down.
- **Memory:** see the scenario RAM footprints before choosing a scenario for 20 players.
