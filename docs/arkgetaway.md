# Ark Bay Tutorial (`sec_f_h_map_tut_j2_arkbaytutorial`)

Human new-user experience (NUX) instanced map **Ark Bay 313**. Players learn controls, complete a linear mission chain, and exit to **The Hestia Back Range** (continent object **693**). This document maps every trigger, reaction, and mission gate from spawn through exit.

**Level viewer:** [`tools/model-viewer/level.html#sec_f_h_map_tut_j2_arkbaytutorial`](../tools/model-viewer/level.html#sec_f_h_map_tut_j2_arkbaytutorial)

**Machine-readable dump:** [`tools/model-viewer/levels/sec_f_h_map_tut_j2_arkbaytutorial.json`](../tools/model-viewer/levels/sec_f_h_map_tut_j2_arkbaytutorial.json)

Regenerate appendix tables: `node tools/scripts/generate-arkbay-doc.mjs`

## Data sources

| Source | Role |
|--------|------|
| MapDump level JSON | Triggers (206), reactions (376), variables (88), paths, markers |
| `clonebase.wad` + GLM mission XML | Mission/objective titles ([`tools/model-viewer/arkbay-missions.json`](../tools/model-viewer/arkbay-missions.json), checked-in snapshot) |
| [`docs/reaction-types.md`](reaction-types.md) | Reaction type semantics and Ghidra handlers |

<!-- AUTO:stats -->
- **Triggers:** 206
- **Reactions:** 376
- **Map variables:** 88
- **Paths:** 23
- **Markers:** 71
- **Objects (placements):** 9502
<!-- /AUTO:stats -->

## Map overview

| Field | Value |
|-------|-------|
| **Stem** | `sec_f_h_map_tut_j2_arkbaytutorial` |
| **Terrain** | 512×512, grid 5, height scale 4, tileset 24 |
| **Skybox** | `sec_urb_01` |
| **Entry point** | `236.4, 8.2, 138.0` |
| **Ark Bay continent** | **707** (`l0_unlock_arkbay` on load) |
| **Exit continent** | **693** (The Back Range — `TransferMap` / `UnlockContObj`) |
| **Per-player load trigger** | COID **16217** (`L0_1xload_onstart`) |
| **Creator load trigger** | COID **14136** (stale — no matching object in dump) |

### Instancing rules

On re-entry after leaving mid-tutorial, dialog **R16220** explains that Ark Bay 313 is an **instanced map** that resets when the convoy leaves. The player receives pamphlet CBID **7791** and may:

- **Continue** — replay from the start
- **Bypass Map** — trigger **T16221**: remove pamphlet, +1000 XP, unlock continent 693, `TransferMap` to Back Range, `FailMission` **3052** skipped if never accepted

## Mission chain (retail order)

Missions auto-chain in the client; map logic gates doors, spawns, and `CompleteObjective` reactions. Patrol waypoints (`L1_coll_patrol*`) have **no trigger reactions** — the mission system completes them via `ObjectiveRequirementPatrol`.

| Order | Mission ID | Title | Internal / script name | Map logic role |
|-------|------------|-------|------------------------|----------------|
| 1 | **554** | New Day Dawning! | `h_tas_Emergence_start` | `GiveMission` on load; objective **714** set active |
| 2 | **3032** | Live and Direct | `h_1-1_tas_arkbay_liveanddirect` | Door 1 requires active mission; patrol objectives **5425–5434, 5530–5536** completed by map reactions |
| 3 | **3035** | Red Tape | `h_1-1_tas_arkbay_redtape` | Condenser interact; objective **5447** |
| 4 | **3041** | Quick Thinking | `h_1-1_tas_arkbay_offlabel` | Destroy condenser after red tape |
| 5 | **3036** | Guns of the Expansion | `h_1-1_tas_arkbay_gunsoftheexpansion` | Airlock / weapons; **T16236** completes objective **5421** |
| 6 | **3037** | Final Exam | `h_1-1_tas_arkbay_finalexam` | Gunny Sioux escort/fight; gated by objective **5422** |
| 7 | **3050** | What's a SCAB Field? | `h_1-1_tas_arkbay_healyerself` | Scav ambush, SCAB repair; **5467** / **5468** |
| 8 | **3052** | Freelancer, Roll Out! | `h_1-1_tas_arkbay_toascent` | Transit to Back Range; failed on bypass |

<!-- AUTO:missions -->
### Mission reactions on this map

| Reaction COID | Name | Type | ID | Resolved name |
|---------------|------|------|-----|---------------|
| 14137 | `l1_givemission_start` | GiveMission | 554 | New Day Dawning! (`h_tas_Emergence_start`) |
| 15832 | `l1_completeobjective_scabfield` | CompleteObjective | 5467 | Repair your vehicle at a SCAB field generator (obj 5467) |
| 16237 | `l1_completeobjective_guns_1` | CompleteObjective | 5421 | Go through the Airlock (obj 5421) |
| 16565 | `L1_completeobj_livenaddirect_patrol7` | CompleteObjective | 5430 | Follow your waypoints to Kelly Sweet (obj 5430) |
| 17178 | `l1_failmission_exit` | FailMission | 3052 | Freelancer, Roll Out! (`h_1-1_tas_arkbay_toascent`) |
| 17188 | `L1_completeobj_livenaddirect_patrol8` | CompleteObjective | 5431 | Follow your waypoints to Kelly Sweet (obj 5431) |
| 17189 | `L1_completeobj_livenaddirect_patrol9` | CompleteObjective | 5432 | Follow your waypoints to Kelly Sweet (obj 5432) |
| 17190 | `L1_completeobj_livenaddirect_patrol10` | CompleteObjective | 5433 | Follow your waypoints to Kelly Sweet (obj 5433) |
| 17191 | `L1_completeobj_livenaddirect_patrol11` | CompleteObjective | 5434 | Follow your waypoints to Kelly Sweet (obj 5434) |
| 17192 | `L1_completeobj_livenaddirect_patrol12` | CompleteObjective | 5530 | Follow your waypoints to Kelly Sweet (obj 5530) |
| 17193 | `L1_completeobj_livenaddirect_patrol13` | CompleteObjective | 5531 | Follow your waypoints to Kelly Sweet (obj 5531) |
| 17194 | `L1_completeobj_livenaddirect_patrol14` | CompleteObjective | 5532 | Follow your waypoints to Kelly Sweet (obj 5532) |
| 17195 | `L1_completeobj_livenaddirect_patrol15` | CompleteObjective | 5533 | Follow your waypoints to Kelly Sweet (obj 5533) |
| 17300 | `L1_completeobj_livenaddirect_patrol6` | CompleteObjective | 5429 | Follow your waypoints to Kelly Sweet (obj 5429) |
| 17301 | `L1_completeobj_livenaddirect_patrol5` | CompleteObjective | 5428 | Follow your waypoints to Kelly Sweet (obj 5428) |
| 17302 | `L1_completeobj_livenaddirect_patrol4` | CompleteObjective | 5427 | Follow your waypoints to Kelly Sweet (obj 5427) |
| 17303 | `L1_completeobj_livenaddirect_patrol3` | CompleteObjective | 5426 | Follow your waypoints to Kelly Sweet (obj 5426) |
| 17304 | `L1_completeobj_livenaddirect_patrol2` | CompleteObjective | 5425 | Follow your waypoints to Kelly Sweet (obj 5425) |
| 17935 | `L0_setact_startobjective` | SetActiveObjective | 714 | Check in with Rogers (obj 714) |

### Map variables referencing missions/objectives

| Var ID | Name | Type | Ref ID | Resolved |
|--------|------|------|--------|----------|
| 2 | `L1_boolean_hasactivemission_tutorial2` | active-mission | 3032 | Live and Direct |
| 8 | `L1_boolean_hasactivemission_tutorial3` | active-mission | 3035 | Red Tape |
| 9 | `L1_boolean_hascompletedmission_tutorial3` | completed-mission | 3035 | Red Tape |
| 10 | `L1_boolean_hasactiveobjective_guns1` | active-objective | 5421 | Go through the Airlock |
| 12 | `L1_hasobjectiveactive_livendirrect17` | active-objective | 5536 | Follow your waypoints to Kelly Sweet |
| 14 | `L1_boolean_hasactiveobjective_guns2` | active-objective | 5421 | Go through the Airlock |
| 15 | `L1_boolean_hasactiveobjective_final` | active-objective | 5422 | Defeat Gunny Sioux |
| 46 | `l1_bool_completedmission_start_5` | completed-mission | 554 | New Day Dawning! |
| 53 | `L1_hasactiveobjective_toascent3` | active-objective | 5471 | Contact Jason Hutchins in the Hestia Back Range |
| 54 | `L1_boolean_hasactiveobjective_redtape2` | active-objective | 5447 | Report the explosion to Kelly Sweet |
| 57 | `l1_boolean_hasactivemission_offlabel` | active-mission | 3041 | Quick Thinking |
| 66 | `l1_boolean_hasactiveobj_whatsascab1` | active-objective | 5467 | Repair your vehicle at a SCAB field generator |
| 214 | `l0_gunnyhealed` | completed-objective | 5468 | Return to Gunny Sioux |
<!-- /AUTO:missions -->

## Step-by-step playthrough (full completion)

### Phase 0 — Spawn and load

1. Player spawns near entry (`236, 8, 138`). **Per-player load** trigger **T16217** fires once.
2. Load reactions: give pamphlet **CBID 7791**, `GiveMission` **554**, mass `MakeInvincible` on key structures, preload cave-in death objects, **relock** Back Range (693), **unlock** Ark Bay (707).
3. **R16227** activates **T16226** which shows start dialog **R16220** (returning players) or chains naglines for first-time flow.
4. **R17935** `SetActiveObjective` **714** — *Check in with Rogers*.
5. Nagline **R16228**: *Left click on Lieutenant Rogers in the glowing pillar of light to continue!*

### Phase 1 — Rogers and Kelly Sweet (mission 554 → 3032)

6. Interact with **Lieutenant Rogers** (mission deliver objective — no dedicated map object name in dump).
7. Receive front weapon **CBID 1223** via **R16225** when the guns flow starts.
8. Mission **3032** becomes active (`L1_boolean_hasactivemission_tutorial2`). First tunnel door **T14097** opens when `l1_door1_hasopened != 1` and tutorial2 is active.
9. Follow waypoint patrol through markers **T14104–T14115** (and extended patrols **16279**, **16566–16571**). Map reactions **R17304–R17195** call `CompleteObjective` for objectives **5425–5434** and **5530–5533** as each segment completes.
10. Second door **T14116** opens when objective **5536** (*liveanddirect_18*) is active.

### Phase 2 — Red Tape and Quick Thinking (3035 → 3041)

11. **Kelly Sweet** / condenser arc: interact with malfunctioning condenser (`obj_gen_h_static_str_01_factory-generator`). Triggers **T16246**, **T16251**, **T16349** drive FX and `l1_hasused_condenser`.
12. Mission **3035** objectives: shut down compressor (**5446**), report explosion (**5447**).
13. Mission **3041**: destroy condenser module (`ObjectiveRequirementKill`), return to Kelly.

### Phase 3 — Cave-in detour

14. **T16590** spawns cave-in FX, shows **R16593** (*A Cave In! Find a detour!*), sets `l1_var_cavedin`.
15. **T14110** (`L1_coll_patrol7`) is blocked while `l1_var_cavedin == 0`; use alternate route via `caves_bridge` path.

### Phase 4 — Guns of the Expansion (3036)

16. Airlock sequence: **T15813**–**T15825**, **T14123**, multi-stage collide FX (**T16472** area), big door vars `l0_bigdoorvar_opening`.
17. **T16236** (`l1_coll_completeobjective_guns_1`) completes objective **5421** — *Go through the Airlock*.

### Phase 5 — Final Exam — Gunny Sioux (3037)

18. When objective **5422** (*Defeat Gunny Sioux*) is active, **T14130** starts escort: **R16283** → **T14134** creates `veh_a_h_c_cha_01_gunnygunny` / armsman husk on paths `GunnySioux1`, `gunnysioux2`, `realgunny*`.
19. Tier doors **T17330** / **T17329** spawn level-gated doors using `Tier_1`…`Tier_6` variables.

### Phase 6 — Scav ambush and SCAB field (3050)

20. **T15821** summons scavs (**R15843** `Create`, **R15844** `Activate` on path `hoopty`). Warning **R16287**: *Look out! A Scav ambush!*
21. Scab-field patrol triggers **T15828–T15834** (and copies) fire **R15832** `CompleteObjective` **5467** — *Repair your vehicle at a SCAB field generator*.
22. `MarkRepairStation` reactions bookmark repair pads **1** and **3**.

### Phase 7 — Heal Gunny and exit (3050 → 3052)

23. **T16465**–**T16479**: Gunny heal sequence — `SkillCast` heal, pain skill, `l1_gunnyheal_lock`, sets **`l0_gunnyhealed`** when objective **5468** (*Return to Gunny Sioux*) completes.
24. Transit warning **T15836** shows **R15837** (*Next Exit : The Back Range*).
25. **T15835** (`L1_coll_transit_tobackrange`) when `l0_gunnyhealed == 1`: remove pamphlet, **R15838** `TransferMap` continent **693**.

### Bypass path (skip tutorial)

- Dialog choice **Bypass Map** → **T16221**: `RemoveFromInv` pamphlet, `AddXP` 1000, `UnlockContObj` 693, `TransferMap` to Back Range.

## Exit conditions summary

| Requirement | Mechanism |
|-------------|-----------|
| Tutorial complete | `l0_gunnyhealed` variable equals 1 (objective **5468** complete) |
| Physical exit | Collide **T15835** at tunnel to Back Range |
| Pamphlet cleanup | **R17936** `RemoveFromInv` CBID 7791 on exit or bypass |
| Continent unlock | **R16218** / load unlock for 693; load **relocks** 693 until exit |

## Key NPCs, items, and paths

| Entity | Notes |
|--------|-------|
| **Lieutenant Rogers** | Dialog nagline only; mission 554 deliver target |
| **Kelly Sweet** | Mission 3032/3035/3041 NPC (dialog in mission text) |
| **Gunny Sioux** | Vehicles on paths `GunnySioux1`, `gunnysioux2`, `realgunny`, `realgunny2`, `realgunny3` |
| **Scavs** | `l1_create_surplusscavs`, ambush on `hoopty` path |
| **Pamphlet** | CBID **7791** — skip/bypass token |
| **Front weapon** | CBID **1223** — tutorial weapon grant |
| **Condenser** | `obj_gen_h_static_str_01_factory-generator` |

**Paths:** `GunnySioux1`, `gunnysioux2`, `hoopty`, `realgunny*`, `caves_bridge`, `rake_01`/`02`, `city_1-A`…`city_7-B` (driving minigame).

## Subsystems

### City driving minigame (`city_*`, 103 triggers)

Isolated pocket (~`368, 2, 1864` and death zones ~`921, 157, 1225`). **G1–G4 Start** triggers randomize sector layouts via `VariableSetRandom` on `city_G*_6` thresholds. Vehicle death triggers teleport via **R16906** (`city_teleport_vehicle_6` → object **16905**). Not required for main exit but shares the map file.

### Boost ramps (`tsp_*`, 5 triggers)

Teaches boost pads: `tsp_Boost_01` (var 1), `tsp_boost_02` (var 219). Reactions include `Boost`, `Activate` light FX.

### Tier doors

**T17330** / **T17329** create `t1Door` / `t2Door` when player enters large volumes — gates progression by `Tier` / `level2` variables.

## Map logic hooks

| Hook | COID |
|------|------|
| `PerPlayerLoadTrigger` | 16217 |
| `CreatorLoadTrigger` | 14136 (unresolved) |
| `OnKillTrigger` | -1 |
| `LastTeamTrigger` | -1 |

## AutoCore server status

Map logic is parsed and exported by MapDump; sector server runs trigger/reaction handlers per [`docs/reaction-types.md`](reaction-types.md). As of this writing:

- Object lifecycle, variables, text packets: partially implemented
- `GiveMission`, `CompleteObjective`, `TransferMap`: **logged stubs** — full mission port pending ([`ObjectReactionHandlers.cs`](../src/AutoCore.Game/Reactions/Handlers/ObjectReactionHandlers.cs))

This document describes **retail / map-author intent** from the extracted `.fam` logic.

## Appendix A — Map variables

<!-- AUTO:variables -->
| ID | Name | Type | Initial | Value | Notes |
|----|------|------|---------|-------|-------|
| 1 | `tsp_Boost_01` | scalar | 57 | 55 | — |
| 2 | `L1_boolean_hasactivemission_tutorial2` | active-mission | 3032 | 3032 | references mission id in Value |
| 3 | `L0_const_0` | scalar | 0 | 0 | — |
| 4 | `L0_const_1` | scalar | 1 | 1 | — |
| 5 | `l1_door1_hasopened` | scalar | 0 | 0 | — |
| 6 | `l1_door2_hasopened` | scalar | 0 | 0 | — |
| 7 | `l1_door3_hasopened` | scalar | 0 | 0 | — |
| 8 | `L1_boolean_hasactivemission_tutorial3` | active-mission | 3035 | 3035 | references mission id in Value |
| 9 | `L1_boolean_hascompletedmission_tutorial3` | completed-mission | 3035 | 3035 | references mission id in Value |
| 10 | `L1_boolean_hasactiveobjective_guns1` | active-objective | 5421 | 5421 | references objective id in Value |
| 11 | `L1_gunnysioux1_hasdeleted` | scalar | 0 | 0 | — |
| 12 | `L1_hasobjectiveactive_livendirrect17` | active-objective | 5536 | 5536 | references objective id in Value |
| 13 | `L1_hascreated_gunny1` | scalar | 0 | 0 | — |
| 14 | `L1_boolean_hasactiveobjective_guns2` | active-objective | 5421 | 5421 | references objective id in Value |
| 15 | `L1_boolean_hasactiveobjective_final` | active-objective | 5422 | 5422 | references objective id in Value |
| 45 | `L0_const_5` | scalar | 1 | 1 | — |
| 46 | `l1_bool_completedmission_start_5` | completed-mission | 554 | 554 | references mission id in Value |
| 47 | `L1_numberofcbid_pamphlet_5` | cbid-count | 7791 | 7791 | — |
| 48 | `L1_const_5` | scalar | 2500 | 2500 | — |
| 49 | `L1_const_5` | scalar | 1500 | 1500 | — |
| 50 | `L1_const_5` | scalar | 0 | 0 | — |
| 51 | `L1_var_playerlevel_5` | player-level | 0 | 0 | — |
| 52 | `L1_hascreated_gunny2` | scalar | 0 | 0 | — |
| 53 | `L1_hasactiveobjective_toascent3` | active-objective | 5471 | 5471 | references objective id in Value |
| 54 | `L1_boolean_hasactiveobjective_redtape2` | active-objective | 5447 | 5447 | references objective id in Value |
| 55 | `L1_hasused_condenser` | scalar | 0 | 0 | — |
| 56 | `l1_heal_pulses` | scalar | 0 | 0 | — |
| 57 | `l1_boolean_hasactivemission_offlabel` | active-mission | 3041 | 3041 | references mission id in Value |
| 58 | `l1_airlockdoor_1_open` | scalar | 0 | 0 | — |
| 59 | `l1_airlockdoor_collidefx_1` | scalar | 0 | 0 | — |
| 60 | `l1_airlockdoor_collidefx_2` | scalar | 0 | 0 | — |
| 61 | `l1_airlockdoor_collidefx_3` | scalar | 0 | 0 | — |
| 62 | `L1_airlock_closed` | scalar | 0 | 0 | — |
| 63 | `l1_gunnyheal_lock` | scalar | 0 | 0 | — |
| 64 | `l1_playerhealth_percent` | health-percent | 0 | 0 | — |
| 65 | `l1_hascast_painskill` | scalar | 0 | 0 | — |
| 66 | `l1_boolean_hasactiveobj_whatsascab1` | active-objective | 5467 | 5467 | references objective id in Value |
| 67 | `l1_const_50percent` | scalar | 0.5 | 0.5 | — |
| 68 | `l1_var_cavedin` | scalar | 0 | 0 | — |
| 69 | `l1_var_buildinghasblown` | scalar | 0 | 0 | — |
| 166 | `city_G1_6` | scalar | 0 | 0 | — |
| 167 | `city_S1_MAX_6` | scalar | 0.14 | 0.14 | — |
| 168 | `city_S2_MAX_6` | scalar | 0.28 | 0.28 | — |
| 169 | `city_S3_MAX_6` | scalar | 0.42 | 0.42 | — |
| 170 | `city_S4_MAX_6` | scalar | 0.56 | 0.56 | — |
| 171 | `city_S5_MAX_6` | scalar | 0.7 | 0.7 | — |
| 172 | `city_S6_MAX_6` | scalar | 0.84 | 0.84 | — |
| 173 | `city_G2_6` | scalar | 0 | 0 | — |
| 174 | `city_G3_6` | scalar | 0 | 0 | — |
| 175 | `city_G4_6` | scalar | 0 | 0 | — |
| 176 | `city_half_6` | scalar | 0.5 | 0.5 | — |
| 177 | `city_quarter_6` | scalar | 0.25 | 0.25 | — |
| 178 | `city_3quarter_6` | scalar | 0.75 | 0.75 | — |
| 179 | `city_1third_6` | scalar | 0.35 | 0.35 | — |
| 180 | `city_2third_6` | scalar | 0.7 | 0.7 | — |
| 181 | `city_J1_6` | scalar | 1 | 1 | — |
| 182 | `city_J2_6` | scalar | 1 | 1 | — |
| 183 | `city_J3_6` | scalar | 1 | 1 | — |
| 184 | `city_J4_6` | scalar | 1 | 1 | — |
| 185 | `city_J5_6` | scalar | 1 | 1 | — |
| 186 | `city_J6_6` | scalar | 1 | 1 | — |
| 187 | `city_J7_6` | scalar | 1 | 1 | — |
| 188 | `city_J8_6` | scalar | 1 | 1 | — |
| 189 | `city_J9_6` | scalar | 1 | 1 | — |
| 190 | `city_J10_6` | scalar | 1 | 1 | — |
| 191 | `city_J11_6` | scalar | 1 | 1 | — |
| 192 | `city_J12_6` | scalar | 1 | 1 | — |
| 193 | `city_J13_6` | scalar | 1 | 1 | — |
| 194 | `city_J14_6` | scalar | 1 | 1 | — |
| 195 | `city_J15_6` | scalar | 1 | 1 | — |
| 196 | `city_J16_6` | scalar | 1 | 1 | — |
| 197 | `city_J17_6` | scalar | 1 | 1 | — |
| 204 | `ON` | scalar | 1 | 1 | — |
| 205 | `OFF` | scalar | 0 | 0 | — |
| 206 | `Tier` | scalar | 0 | 0 | — |
| 207 | `Tier_1` | scalar | 1 | 1 | — |
| 208 | `Tier_2` | scalar | 2 | 2 | — |
| 209 | `Tier_3` | scalar | 3 | 3 | — |
| 210 | `Tier_4` | scalar | 4 | 4 | — |
| 211 | `Tier_5` | scalar | 5 | 5 | — |
| 212 | `Tier_6` | scalar | 6 | 6 | — |
| 213 | `level2` | scalar | 2 | 2 | — |
| 214 | `l0_gunnyhealed` | completed-objective | 5468 | 5468 | exit gate — must be 1 for transit |
| 215 | `l0_cons_1000` | scalar | 1000 | 1000 | — |
| 216 | `l1_const_22` | scalar | 22 | 22 | — |
| 217 | `l0_faction_default` | scalar | -1 | -1 | — |
| 218 | `l0_bigdoorvar_opening` | scalar | 0 | 0 | — |
| 219 | `tsp_boost_02` | scalar | 48 | 45 | — |
<!-- /AUTO:variables -->

## Appendix B — Triggers (complete)

<!-- AUTO:triggers -->
### Main tutorial (`l1_` / `L1_` / `L0_`) (98 triggers)

| COID | Name | Position | Scale | Conditions | Reactions |
|------|------|----------|-------|------------|-----------|
| 14097 | `l1_coll_opendoor_1` | 235.6, 8.2, 205.1 | 35 | l1_door1_hasopened NotEqualTo L0_const_1; L1_boolean_hasactivemission_tutorial2 EqualTo L0_const_1 | R14098 `l1_death_opendoor_1` (Death)<br>R14101 `l1_act_door1_actuator` (Activate)<br>R16307 `l1_act_door1_physics_remover` (Activate) |
| 14100 | `L1_rem_setvar_door1` | 214.1, 8.2, 232.5 | 1 | — | R14099 `L1_setvar_door1` (VariableSet) |
| 14102 | `l1_rem_door1_second` | 213.7, 8.2, 268.8 | 1 | l1_door1_hasopened EqualTo L0_const_1 | R14103 `l1_death_opendoor_1-2` (Death)<br>R16336 `l1_act_door1_2_physics_remover` (Activate) |
| 14104 | `L1_coll_patrol1` | 243.3, 11.5, 368.7 | 5 | — | — |
| 14105 | `L1_coll_patrol2` | 279.9, 12.4, 387.7 | 5 | — | — |
| 14106 | `L1_coll_patrol3` | 356.5, 12.3, 403.7 | 5 | — | — |
| 14107 | `L1_coll_patrol4` | 454.1, 20.7, 529.7 | 5 | — | — |
| 14108 | `L1_coll_patrol5` | 525.3, 13.2, 661.1 | 5 | — | — |
| 14109 | `L1_coll_patrol6` | 554.4, 14.5, 805.0 | 5 | — | — |
| 14110 | `L1_coll_patrol7` | 479.1, 8.5, 937.4 | 5 | l1_var_cavedin EqualTo L0_const_0 | — |
| 14111 | `L1_coll_patrol8` | 377.1, 18.5, 964.7 | 5 | — | — |
| 14112 | `L1_coll_patrol9` | 341.6, 12.8, 814.3 | 5 | — | — |
| 14113 | `L1_coll_patrol10` | 339.9, 20.4, 598.4 | 5 | — | — |
| 14114 | `L1_coll_patrol11` | 196.4, 7.0, 566.2 | 5 | — | — |
| 14115 | `L1_coll_patrol12` | 186.4, 3.6, 723.1 | 5 | — | — |
| 14116 | `L1_coll_opendoor_2` | 275.4, 70.1, 1664.4 | 45 | l1_door2_hasopened NotEqualTo L0_const_1; L1_hasobjectiveactive_livendirrect17 EqualTo L0_const_1 | R14120 `l1_death_opendoor_2` (Death)<br>R14118 `l1_act_door2_actuator` (Activate)<br>R16261 `l1_create_door_2_fx` (Create) |
| 14117 | `L1_rem_opendoor_2_2` | 256.3, 80.1, 1750.2 | 1 | l1_door2_hasopened EqualTo L0_const_1 | R14122 `l1_death_opendoor_2-2` (Death)<br>R16264 `l1_act_door2_fx_close` (Activate) |
| 14119 | `L1_rem_setvar_door2` | 258.4, 70.1, 1675.9 | 1 | — | R14121 `L1_setvar_door2` (VariableSet) |
| 14123 | `l1_rem_actuator_airlock_door1` | 667.2, 85.1, 1952.5 | 1 | — | R14124 `l1_death_opendoor_3-1` (Death)<br>R14125 `L1_setvar_door3` (VariableSet) |
| 14128 | `L1_rem_destroystationaryFX_actuator` | 476.0, 83.9, 1904.2 | 2 | — | R16253 `l1_create_condenser_deathfx` (Create)<br>R16254 `l1_delete_extracondenser_fx` (Delete) |
| 14130 | `l1_coll_initiategunnysioux` | 1051.1, 84.7, 1984.6 | 50 | L1_boolean_hasactiveobjective_final EqualTo L0_const_1 | R16283 `l1_act_gunny_start` (Activate) |
| 14134 | `l1_rem_gunnysioux_initiator` | 1057.2, 84.9, 1959.3 | 2 | L1_gunnysioux1_hasdeleted EqualTo L0_const_0 | R14133 `l1_del_gunnysioux1` (Delete)<br>R14139 `l1_create_gunny1` (Create)<br>R14142 `l1_act_gunny1` (Activate)<br>R16285 `l1_act_gunnycreate_setvar` (Activate) |
| 15813 | `L1_coll_airlockdoor_1` | 644.4, 79.6, 1984.4 | 35 | L1_boolean_hasactiveobjective_guns1 EqualTo L0_const_1; l1_airlockdoor_1_open EqualTo L0_const_0 | R14124 `l1_death_opendoor_3-1` (Death)<br>R16379 `L1_act_airlock_door1_fx` (Activate) |
| 15815 | `l1_coll_init_airlocksequence` | 783.8, 85.1, 1988.5 | 35 | L1_boolean_hasactiveobjective_guns2 EqualTo L0_const_1; l1_airlockdoor_collidefx_3 EqualTo L0_const_0 | R15827 `l1_act_door3_airlock_fxstart` (Activate) |
| 15818 | `l1_rem_creates_gunny2` | 1134.6, 88.1, 1900.0 | 5 | — | R15819 `l1_create_gunny2` (Create)<br>R16241 `L1_setvar_gunny2_created` (VariableSet)<br>R16218 `L1_unlock_backrange` (UnlockContObj) |
| 15821 | `L1_rem_summonscavs` | 1532.4, 92.6, 2165.8 | 5 | — | R15843 `l1_create_surplusscavs` (Create)<br>R16617 `l1_setvar_buildinghasblown` (VariableSet) |
| 15823 | `l1_coll_collapse_skyscraper` | 1549.3, 98.7, 2245.4 | 175 | L1_hasactiveobjective_toascent3 EqualTo L0_const_1; l1_var_buildinghasblown EqualTo L0_const_0 | R16287 `L1_text_ambushwarning` (Text)<br>R15822 `l1_death_forcollapse` (Death)<br>R15844 `l1_act_scavsambush` (Activate)<br>R16290 `l1_del_bridges_fx` (Delete) |
| 15824 | `L1_rem_airlock_sequence` | 797.8, 85.1, 1972.5 | 1 | — | R15826 `l1_act_door3_airlock_fxend` (Activate)<br>R16416 `l1_del_airlock_coll3_steam` (Delete)<br>R16440 `l1_create_airlock_extrafx_onsequence` (Create) |
| 15825 | `L1_rem_endfx_airlock` | 801.3, 85.1, 1972.3 | 1 | — | R16340 `l1_del_door3_airlock_physics` (Delete)<br>R16418 `l1_create_airlock_collfx_3_2` (Create)<br>R16419 `l1_act_airlock_coll4_1` (Activate) |
| 15828 | `l1_coll_scabfield_patrolmarkers_1` | 1165.4, 88.1, 1855.1 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 15833 | `l1_coll_scabfield_patrolmarkers_2` | 1177.4, 88.1, 1869.4 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 15834 | `l1_coll_scabfield_patrolmarkers_3` | 1177.1, 88.1, 1910.1 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 15835 | `L1_coll_transit_tobackrange` | 1958.7, 68.2, 2391.3 | 15 | l0_gunnyhealed EqualTo L0_const_1 | R17936 `l0_takeitem_pamphlet` (RemoveFromInv)<br>R15838 `l1_maptransfer_tobackrange` (TransferMap) |
| 15836 | `L1_coll_transitwarning_backrange` | 1959.3, 68.0, 2388.6 | 35 | l0_gunnyhealed EqualTo L0_const_1 | R15837 `l1_text_transitwarning` (Text) |
| 15846 | `l1_coll_patrol_toascent` | 1530.8, 93.7, 2002.5 | 5 | — | — |
| 16217 | `L0_1xload_onstart` | 186.2, 176.7, 266.5 | 5 | — | R16230 `l1_act_nagline_5_b` (Activate)<br>R16227 `L0_act_1xload_withitem_5` (Activate)<br>R16219 `l0_giveitem_onload_forskip_5` (GiveItemNumCBID)<br>R14137 `l1_givemission_start` (GiveMission)<br>R16235 `l1_act_nagline_5` (Activate)<br>R16447 `l1_death_forcollapse_preload` (Death)<br>R15031 `l1_setinvul_gen_h` (MakeInvincible)<br>R16629 `l1_setinvul_gen_h_2` (MakeInvincible)<br>R17315 `l1_setinvul_gen_h_3` (MakeInvincible)<br>R17316 `l1_setinvul_gen_h_4` (MakeInvincible)<br>R17389 `l1_invul_another` (MakeInvincible)<br>R17395 `l1_setinvul_gen_h_5` (MakeInvincible)<br>R17410 `l1_setinvul_gen_h_6` (MakeInvincible)<br>R17736 `l0_death_outsidegate` (Death)<br>R17735 `l0_invul_outsidebase` (MakeInvincible)<br>R17871 `l0_relock_backrange` (RelockContObj)<br>R17913 `l0_unlock_arkbay` (UnlockContObj) |
| 16221 | `L1_rem_choicedialog_5` | 1958.7, 68.2, 2391.3 | 2.5 | — | R17936 `l0_takeitem_pamphlet` (RemoveFromInv)<br>R16223 `L1_givexp` (AddXP)<br>R16218 `L1_unlock_backrange` (UnlockContObj)<br>R16222 `L0_transfermap_backrange` (TransferMap) |
| 16226 | `L1_rem_1xload_startskipchoice_5` | 184.4, 177.5, 258.3 | 1 | — | R16220 `L1_text_start_withitem_5` (Text)<br>R17178 `l1_failmission_exit` (FailMission) |
| 16229 | `L1_rem_onload_fornaglines_5` | 187.3, 177.6, 255.1 | 2.5 | l1_bool_completedmission_start_5 EqualTo L1_const_5 | R16232 `l1_act_nagline_repeat_5` (Activate) |
| 16231 | `L1_rem_activate_nagline_5` | 190.9, 177.6, 254.5 | 1 | — | R16230 `l1_act_nagline_5_b` (Activate) |
| 16234 | `L1_rem_activate_nagline_5` | 191.1, 177.6, 251.6 | 1 | l1_bool_completedmission_start_5 EqualTo L1_const_5 | R16233 `L1_text_nagline_2_arrow_5` (Text)<br>R16235 `l1_act_nagline_5` (Activate) |
| 16236 | `l1_coll_completeobjective_guns_1` | 826.8, 85.1, 1986.9 | 15 | — | R16237 `l1_completeobjective_guns_1` (CompleteObjective) |
| 16246 | `L1_coll_condenser_extrapow` | 483.1, 82.2, 1895.5 | 35 | L1_boolean_hasactiveobjective_redtape2 EqualTo L0_const_1; L1_hasused_condenser EqualTo L0_const_0 | R16247 `l1_create_use_condenser_fx` (Create)<br>R16252 `l1_act_condenser_usefx` (Activate) |
| 16251 | `l1_rem_setvar_condensersafety` | 479.8, 84.6, 1903.4 | 1 | — | R16250 `l1_setvar_condenser_used_fx` (VariableSet) |
| 16262 | `L1_rem_opendoor_2_fxclose` | 255.9, 81.1, 1754.3 | 2.5 | — | R16263 `l1_delete_door_2_fx` (Delete)<br>R16275 `l1_create_door_2_fx_2` (Create)<br>R16278 `l1_act_door_2_completer` (Activate)<br>R16352 `l1_del_door2_2_physics` (Delete)<br>R17881 `l1_door4_createcorners` (Create) |
| 16276 | `l1_rem_door_2_fx_complete` | 256.5, 83.2, 1768.1 | 2.5 | — | R16277 `l1_delete_door_2_fx_2` (Delete) |
| 16279 | `L1_coll_patroltarget` | 873.1, 85.1, 1987.8 | 2 | — | — |
| 16284 | `L1_rem_setvar_gunnysafety` | 1053.4, 84.9, 1959.4 | 1 | — | R14135 `L1_setvar_gunnyhasdeleted_1` (VariableSet) |
| 16286 | `l1_coll_scabfield_patrolmarkers_4` | 1146.9, 88.1, 1854.7 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 16305 | `l1_rem_door1_physics` | 261.2, 8.2, 233.7 | 1 | — | R16306 `l1_del_door1_physics` (Delete)<br>R17896 `l1_door1_createcorners` (Create) |
| 16308 | `L1_rem_door1_2-physics` | 213.8, 8.2, 271.4 | 1.25 | — | R16310 `l1_del_door1_2_physics` (Delete)<br>R17891 `l1_door2_createcorners` (Create) |
| 16341 | `L1_coll_airlock_closer` | 966.1, 85.1, 1987.5 | 55 | L1_airlock_closed EqualTo L0_const_0 | R17299 `l1_create_door3_end_airlock_physics` (Create)<br>R16345 `l1_create_door3_airlock_physics` (Create)<br>R17911 `l1_deletecavernwalls` (Delete)<br>R17921 `l1_act_repairbind_outside` (Activate) |
| 16343 | `L1_rem_airlock_close_final` | 902.0, 85.1, 2021.0 | 3 | — | R16442 `l1_setvar_airlock_final_toclosed` (VariableSet)<br>R17931 `BIGDOOR_l0_delete_closingdoor` (Delete)<br>R17926 `BIGDOOR_l0_create_staticcloseddoor` (Create) |
| 16349 | `l1_coll_makevulnerable_formission` | 482.1, 83.6, 1900.7 | 30 | l1_boolean_hasactivemission_offlabel EqualTo L0_const_1 | R16350 `l1_makevulnerable_condenser` (MakeNotInvincbile)<br>R17919 `l1_setfaction_generator_human` (SetFactionFromVar) |
| 16375 | `L1_rem_airlockdoor_1_openfx` | 669.8, 85.1, 2002.1 | 1 | — | R16380 `l1_setvar_airlock_1_open_to1` (VariableSet)<br>R16381 `l1_act_airlock_door_1_fx_2` (Activate)<br>R16392 `l1_create_airlock_1_fx_1` (Create) |
| 16376 | `L1_rem_airlockdoor_1_openfx_2` | 672.7, 85.1, 2002.2 | 1 | — | R16393 `l1_delete_airlock_1_fx_1` (Delete)<br>R16394 `l1_create_airlock_1_fx_2` (Create)<br>R16498 `l1_del_door3_airlock_entryphysics` (Delete)<br>R17876 `l1_door5_createcorners` (Create) |
| 16377 | `l1_coll_airlock_collide_fx1` | 706.6, 85.1, 1988.3 | 20 | l1_airlockdoor_collidefx_1 EqualTo L0_const_0 | R16401 `l1_act_airlock_coll1_1` (Activate)<br>R16555 `l1_create_door_3_closing` (Create)<br>R16471 `l1_act_heal_final` (Activate)<br>R16556 `l1_death_door_3_closing` (Death) |
| 16378 | `l1_rem_airlock_coll1_1` | 709.3, 85.1, 2001.6 | 1 | — | R16400 `l1_create_airlock_collfx_1` (Create)<br>R16397 `l1_setvar_airlock_collide1_to1` (VariableSet)<br>R16402 `l1_act_airlock_coll1_2` (Activate)<br>R16403 `l1_delete_airlock_coll1_steam` (Delete) |
| 16382 | `l1_rem_airlock_coll1_2` | 711.8, 85.1, 2001.6 | 1 | — | R16406 `l1_create_airlock_collfx_3_steam` (Create) |
| 16383 | `l1_rem_coll2_2` | 755.9, 85.1, 2001.1 | 1 | — | R16413 `l1_create_airlock_coll2_fx_2` (Create)<br>R16406 `l1_create_airlock_collfx_3_steam` (Create) |
| 16384 | `l1_rem_airlock_coll2_1` | 753.4, 85.1, 2001.2 | 1 | — | R16398 `l1_setvar_airlock_collide2_to1` (VariableSet)<br>R16411 `l1_create_airlock_coll2_fx_1` (Create)<br>R16412 `l1_act_airlock_coll2_2` (Activate)<br>R16414 `l1_delete_airlock_coll2_steam` (Delete) |
| 16386 | `l1_rem_airlock_coll3_1` | 799.8, 85.1, 2001.5 | 1 | — | R16399 `l1_setvar_airlock_collide3_to1` (VariableSet)<br>R16417 `l1_create_airlock_collfx_3_1` (Create) |
| 16388 | `l1_rem_airlock_coll4_1` | 865.7, 85.1, 2001.4 | 1 | — | R16421 `l1_create_airlock_collfx_4_1` (Create)<br>R16460 `l1_death_gunny_first` (Death) |
| 16407 | `l1_coll_airlock_collide_fx2` | 756.0, 85.1, 1988.2 | 20 | l1_airlockdoor_collidefx_2 EqualTo L0_const_0 | R16410 `l1_act_airlock_coll2_1` (Activate) |
| 16428 | `L1_rem_door2_delete_physics` | 258.0, 70.8, 1694.9 | 1 | — | R16429 `l1_del_door_2_physics` (Delete)<br>R17886 `l1_door3_createcorners` (Create) |
| 16463 | `L1_coll_spawn_gunny2` | 1170.8, 88.1, 1892.7 | 105 | l1_gunnyheal_lock EqualTo L0_const_0 | R16464 `l1_death_gunny_2_car` (Death)<br>R16467 `l1_create_gunnyheals` (Create)<br>R16468 `l1_act_gunnyheal_1` (Activate) |
| 16465 | `L1_rem_gunnyheal_init` | 1113.2, 88.1, 1902.6 | 5 | — | R16467 `l1_create_gunnyheals` (Create)<br>R16469 `L1_setvar_gunny2_heals` (VariableSet) |
| 16466 | `L1_rem_heal_repeater` | 1113.3, 88.1, 1911.8 | 3 | — | R16467 `l1_create_gunnyheals` (Create)<br>R16471 `l1_act_heal_final` (Activate) |
| 16470 | `L1_rem_heal_repeater copy` | 1113.8, 88.1, 1917.7 | 1.5 | — | R16467 `l1_create_gunnyheals` (Create) |
| 16472 | `l1_coll_humanrepairpad_1` | 1177.1, 88.1, 1910.1 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 16474 | `l1_coll_humanrepairpad_2` | 1177.6, 88.1, 1869.5 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 16475 | `l1_coll_humanrepairpad_3` | 1165.1, 88.1, 1855.1 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 16476 | `l1_coll_humanrepairpad_1 copy` | 1146.9, 88.1, 1855.0 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 16477 | `l1_coll_dealsdamage` | 1158.7, 88.1, 1886.4 | 50 | l1_boolean_hasactiveobj_whatsascab1 EqualTo L0_const_1; l1_hascast_painskill EqualTo L0_const_0 | R16480 `l1_act_castthepain` (Activate) |
| 16479 | `l1_rem_setvar_painhascast` | 1115.4, 88.1, 1830.8 | 5 | — | R16481 `l1_skillcast_pain` (SkillCast)<br>R16478 `L1_setvar_hascast_painskill` (VariableSet) |
| 16496 | `L1_coll_terrainhint` | 516.8, 6.9, 617.9 | 50 | — | R16497 `l1_hintrxn_terrainhint` (FirstTimeEvent) |
| 16559 | `l1_coll_close_thedoor` | 277.7, 82.8, 1813.4 | 35 | — | R16561 `l1_act_door2_close_final` (Activate) |
| 16560 | `L1_door_2_closed` | 260.0, 84.5, 1836.8 | 1 | — | R16558 `l1_create_door_2_closing` (Create)<br>R16562 `l1_delete_door_2_closing` (Delete)<br>R16563 `l1_death_toclose_door_2` (Death)<br>R16564 `l1_create_door2_2_physics` (Create) |
| 16566 | `l1_COLL_liveanddirect_13` | 187.9, 5.9, 790.2 | 5 | — | — |
| 16567 | `l1_coll_livendirect_14` | 158.3, 7.1, 974.0 | 5 | — | — |
| 16568 | `l1_coll_livendirect_15` | 176.4, 11.0, 1164.3 | 5 | — | — |
| 16569 | `l1_coll_livendirect_16` | 325.6, 11.0, 1289.7 | 5 | — | — |
| 16570 | `l1_coll_livendirect_17` | 278.1, 67.1, 1559.9 | 5 | — | — |
| 16571 | `l1_coll_livendirect_patrol_last` | 276.9, 80.1, 1751.4 | 5 | — | — |
| 16590 | `l1_rem_fx_cleanup_cavein` | 477.1, 9.0, 942.5 | 5 | — | R16579 `l1_create_cavein_1` (Create)<br>R16593 `l1_text_acavein` (Text)<br>R16595 `L1_setvar_cavedin_1` (VariableSet)<br>R16598 `l1_act_cavein_cleanup` (Activate)<br>R16602 `l1_create_cavein_residual` (Create) |
| 16596 | `l1_rem_fx_cleanup_cavein_2` | 476.1, 9.4, 945.5 | 3 | — | R16597 `l1_del_cave-in_cleanup` (Delete) |
| 17329 | `l1_coll_t2door` | 487.1, 81.8, 1855.5 | 80 | — | R17328 `l1_create_t2Door` (Create) |
| 17330 | `l1_coll_t1Door` | 296.9, 8.3, 1120.4 | 200 | — | R17327 `l1_create_t1Door` (Create) |
| 17350 | `l1_coll_thelolerbomb` | 1327.5, 88.4, 1849.5 | 45 | — | R17349 `l1_create_artilerylol` (Create)<br>R17348 `l1_death_stuffslol` (Death) |
| 17732 | `l1_coll_scabfield_patrolmarkers_2 copy` | 1246.8, 84.0, 1741.2 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 17733 | `l1_coll_humanrepairpad_2 copy` | 1247.1, 84.0, 1741.2 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 17868 | `l1_coll_scabfield_patrolmarkers_INC` | 1133.4, 88.1, 1888.5 | 4 | l1_playerhealth_percent EqualTo L0_const_1 | R15832 `l1_completeobjective_scabfield` (CompleteObjective) |
| 17869 | `l1_coll_humanrepairpad_INC` | 1133.3, 88.1, 1888.6 | 3.5 | — | R16446 `l1_skillcast_heal` (SkillCast) |
| 17901 | `l1_coll_openairlock` | 810.6, 85.1, 1988.0 | 30 | — | R17927 `BIGDOOR_l0_delete_staticcloseddoor` (Delete)<br>R17928 `BIGDOOR_l0_create_openingdoor` (Create)<br>R17904 `l1_airlock_activateremtrig` (Activate) |
| 17903 | `l1_rem_airlockstationary` | 803.7, 85.1, 1988.1 | 10 | — | R17932 `BIGDOOR_setvar_bigdooropened` (VariableSet) |
| 17916 | `l0_col_delete_TierDoors` | 235.5, 8.2, 137.5 | 20 | — | R17914 `l1_delete_t1Door` (Delete)<br>R17915 `l1_delete_t2Door` (Delete)<br>R17913 `l0_unlock_arkbay` (UnlockContObj)<br>R17935 `L0_setact_startobjective` (SetActiveObjective) |
| 17920 | `l0_rem_markrepair` | 1158.8, 88.1, 1888.7 | 1 | — | R16553 `l1_bindrepair_player` (MarkRepairStation) |
| 17933 | `l0_rem_BIGDOOR_closedoor` | 905.0, 85.1, 1993.9 | 1 | l0_bigdoorvar_opening EqualTo L0_const_1 | R17930 `BIGDOOR_l0_create_closingdoor` (Create)<br>R17929 `BIGDOOR_l0_delete_openingdoor` (Delete)<br>R16344 `l1_act_airlock_close_final` (Activate) |

### City driving minigame (`city_`) (103 triggers)

| COID | Name | Position | Scale | Conditions | Reactions |
|------|------|----------|-------|------------|-----------|
| 16838 | `city_G1S1_Activate_6` | 94.0, 2.3, 2214.4 | 1 | city_G1_6 LessThan city_S1_MAX_6 | R16781 `city_G1_S1_Create_6` (Create)<br>R16788 `city_G1_S1_Activate_6` (Activate) |
| 16839 | `city_G2S1_Activate_6` | 97.3, 2.3, 2214.4 | 1 | city_G2_6 LessThan city_S1_MAX_6 | R16796 `city_G2_S1_Create_6` (Create)<br>R16795 `city_G2_S1_Activate_6` (Activate) |
| 16840 | `city_G3S1_Activate_6` | 94.2, 2.3, 2211.4 | 1 | city_G3_6 LessThan city_S1_MAX_6 | R16803 `city_G3_S1_Create_6` (Create)<br>R16823 `city_G3_S1_Activate_6` (Create) |
| 16841 | `city_G4S1_Activate_6` | 97.5, 2.3, 2211.3 | 1 | city_G4_6 LessThan city_S1_MAX_6 | R16810 `city_G4_S1_Create_6` (Create)<br>R16830 `city_G4_S1_Activate_6` (Activate) |
| 16842 | `city_G1S2_Activate_6` | 93.9, 2.3, 2067.8 | 1 | city_G1_6 LessThan city_S2_MAX_6; city_G1_6 GreaterThanOrEqualTo city_S1_MAX_6 | R16782 `city_G1_S2_Create_6` (Create)<br>R16789 `city_G1_S2_Activate_6` (Activate) |
| 16843 | `city_G3S2_Activate_6` | 94.0, 2.3, 2064.7 | 1 | city_G3_6 GreaterThanOrEqualTo city_S1_MAX_6; city_G3_6 LessThan city_S2_MAX_6 | R16804 `city_G3_S2_Create_6` (Create)<br>R16824 `city_G3_S2_Activate_6` (Activate) |
| 16844 | `city_G4S2_Activate_6` | 97.4, 2.3, 2064.7 | 1 | city_G4_6 LessThan city_S2_MAX_6; city_G4_6 GreaterThanOrEqualTo city_S1_MAX_6 | R16811 `city_G4_S2_Create_6` (Create)<br>R16831 `city_G4_S2_Activate_6` (Activate) |
| 16845 | `city_G2S2_Activate_6` | 97.1, 2.3, 2067.7 | 1 | city_G2_6 GreaterThanOrEqualTo city_S1_MAX_6; city_G2_6 LessThan city_S2_MAX_6 | R16797 `city_G2_S2_Create_6` (Create)<br>R16817 `city_G2_S2_Activate_6` (Activate) |
| 16846 | `city_G1S3_Activate_6` | 92.6, 2.3, 1927.9 | 1 | city_G1_6 GreaterThanOrEqualTo city_S2_MAX_6; city_G1_6 LessThan city_S3_MAX_6 | R16783 `city_G1_S3_Create_6` (Create)<br>R16790 `city_G1_S3_Activate_6` (Activate) |
| 16847 | `city_G3S3_Activate_6` | 92.8, 2.3, 1924.9 | 1 | city_G3_6 GreaterThanOrEqualTo city_S2_MAX_6; city_G3_6 LessThan city_S3_MAX_6 | R16805 `city_G3_S3_Create_6` (Create)<br>R16825 `city_G3_S3_Activate_6` (Activate) |
| 16848 | `city_G4S3_Activate_6` | 96.1, 2.3, 1924.8 | 1 | city_G4_6 LessThan city_S3_MAX_6; city_G4_6 GreaterThanOrEqualTo city_S2_MAX_6 | R16812 `city_G4_S3_Create_6` (Create)<br>R16832 `city_G4_S3_Activate_6` (Activate) |
| 16849 | `city_G2S3_Activate_6` | 95.8, 2.3, 1927.9 | 1 | city_G2_6 GreaterThanOrEqualTo city_S2_MAX_6; city_G2_6 LessThan city_S3_MAX_6 | R16798 `city_G2_S3_Create_6` (Create)<br>R16818 `city_G2_S3_Activate_6` (Activate) |
| 16850 | `city_G1S4_Activate_6` | 185.1, 3.0, 1827.6 | 1 | city_G1_6 GreaterThanOrEqualTo city_S3_MAX_6; city_G1_6 LessThan city_S4_MAX_6 | R16784 `city_G1_S4_Create_6` (Create)<br>R16791 `city_G1_S4_Activate_6` (Activate) |
| 16851 | `city_G3S4_Activate_6` | 185.3, 4.0, 1824.5 | 1 | city_G3_6 LessThan city_S4_MAX_6; city_G3_6 GreaterThanOrEqualTo city_S3_MAX_6 | R16806 `city_G3_S4_Create_6` (Create)<br>R16826 `city_G3_S4_Activate_6` (Activate) |
| 16852 | `city_G4S4_Activate_6` | 188.7, 24.7, 1824.4 | 1 | city_G4_6 GreaterThanOrEqualTo city_S3_MAX_6; city_G4_6 LessThan city_S4_MAX_6 | R16813 `city_G4_S4_Create_6` (Create)<br>R16833 `city_G4_S4_Activate_6` (Activate) |
| 16853 | `city_G2S4_Activate_6` | 188.4, 22.6, 1827.5 | 1 | city_G2_6 LessThan city_S4_MAX_6; city_G2_6 GreaterThanOrEqualTo city_S3_MAX_6 | R16799 `city_G2_S4_Create_6` (Create)<br>R16819 `city_G2_S4_Activate_6` (Activate) |
| 16854 | `city_G1S5_Activate_6` | 353.1, 2.3, 1843.4 | 1 | city_G1_6 LessThan city_S5_MAX_6; city_G1_6 GreaterThanOrEqualTo city_S4_MAX_6 | R16785 `city_G1_S5_Create_6` (Create)<br>R16792 `city_G1_S5_Activate_6` (Activate) |
| 16855 | `city_G3S5_Activate_6` | 353.2, 2.3, 1840.3 | 1 | city_G3_6 LessThan city_S5_MAX_6; city_G3_6 GreaterThanOrEqualTo city_S4_MAX_6 | R16807 `city_G3_S5_Create_6` (Create)<br>R16827 `city_G3_S5_Activate_6` (Activate) |
| 16856 | `city_G4S5_Activate_6` | 356.6, 2.3, 1840.3 | 1 | city_G4_6 GreaterThanOrEqualTo city_S4_MAX_6; city_G4_6 LessThan city_S5_MAX_6 | R16814 `city_G4_S5_Create_6` (Create)<br>R16834 `city_G4_S5_Activate_6` (Activate) |
| 16857 | `city_G2S5_Activate_6` | 356.3, 2.3, 1843.3 | 1 | city_G2_6 GreaterThanOrEqualTo city_S4_MAX_6; city_G2_6 LessThan city_S5_MAX_6 | R16800 `city_G2_S5_Create_6` (Create)<br>R16820 `city_G2_S5_Activate_6` (Activate) |
| 16858 | `city_G1S6_Activate_6` | 624.6, 2.3, 2253.8 | 1 | city_G1_6 GreaterThanOrEqualTo city_S5_MAX_6; city_G1_6 LessThan city_S6_MAX_6 | R16786 `city_G1_S6_Create_6` (Create)<br>R16793 `city_G1_S6_Activate_6` (Activate) |
| 16859 | `city_G3S6_Activate_6` | 624.8, 2.3, 2250.8 | 1 | city_G3_6 GreaterThanOrEqualTo city_S5_MAX_6; city_G3_6 LessThan city_S6_MAX_6 | R16808 `city_G3_S6_Create_6` (Create)<br>R16828 `city_G3_S6_Activate_6` (Create) |
| 16860 | `city_G4S6_Activate_6` | 628.1, 2.3, 2250.7 | 1 | city_G4_6 LessThan city_S6_MAX_6; city_G4_6 GreaterThanOrEqualTo city_S5_MAX_6 | R16815 `city_G4_S6_Create_6` (Create)<br>R16835 `city_G4_S6_Activate_6` (Activate) |
| 16861 | `city_G2S6_Activate_6` | 627.9, 2.3, 2253.8 | 1 | city_G2_6 LessThan city_S6_MAX_6; city_G2_6 GreaterThanOrEqualTo city_S5_MAX_6 | R16801 `city_G2_S6_Create_6` (Create)<br>R16821 `city_G2_S6_Activate_6` (Activate) |
| 16862 | `city_G1S7_Activate_6` | 338.7, 2.3, 2480.1 | 1 | city_G1_6 GreaterThanOrEqualTo city_S6_MAX_6 | R16787 `city_G1_S7_Create_6` (Create)<br>R16794 `city_G1_S7_Activate_6` (Activate) |
| 16863 | `city_G3S7_Activate_6` | 338.9, 2.3, 2477.1 | 1 | city_G3_6 GreaterThanOrEqualTo city_S6_MAX_6 | R16809 `city_G3_S7_Create_6` (Create)<br>R16829 `city_G3_S7_Activate_6` (Activate) |
| 16864 | `city_G4S7_Activate_6` | 342.3, 2.3, 2477.0 | 1 | city_G4_6 GreaterThanOrEqualTo city_S6_MAX_6 | R16816 `city_G4_S7_Create_6` (Create)<br>R16836 `city_G4_S7_Activate_6` (Activate) |
| 16865 | `city_G2S7_Activate_6` | 342.0, 2.3, 2480.1 | 1 | city_G2_6 GreaterThanOrEqualTo city_S6_MAX_6 | R16802 `city_G2_S7_Create_6` (Create)<br>R16822 `city_G2_S7_Activate_6` (Activate) |
| 16866 | `city_G1_Start_6` | 368.4, 2.3, 1864.5 | 1 | — | R16777 `city_Gamble_G1_6` (VariableSetRandom)<br>R16870 `city_activate_G1S1_6` (Activate)<br>R16874 `city_activate_G1S2_6` (Activate)<br>R16878 `city_activate_G1S3_6` (Activate)<br>R16882 `city_activate_G1S4_6` (Activate)<br>R16886 `city_activate_G1S5_6` (Activate)<br>R16890 `city_activate_G1S6_6` (Activate)<br>R16894 `city_activate_G1S7_6` (Activate) |
| 16867 | `city_G2_Start_6` | 391.0, 2.3, 1864.5 | 1 | — | R16778 `city_Gamble_G2_6` (VariableSetRandom)<br>R16871 `city_activate_G2S1_6` (Activate)<br>R16875 `city_activate_G2S2_6` (Activate)<br>R16879 `city_activate_G2S3_6` (Activate)<br>R16883 `city_activate_G2S4_6` (Activate)<br>R16887 `city_activate_G2S5_6` (Activate)<br>R16891 `city_activate_G2S6_6` (Activate)<br>R16895 `city_activate_G2S7_6` (Activate) |
| 16868 | `city_G3_Start_6` | 368.5, 2.3, 1842.1 | 1 | — | R16779 `city_Gamble_G3_6` (VariableSetRandom)<br>R16872 `city_activate_G3S1_6` (Activate)<br>R16876 `city_activate_G3S2_6` (Activate)<br>R16880 `city_activate_G3S3_6` (Activate)<br>R16884 `city_activate_G3S4_6` (Activate)<br>R16888 `city_activate_G3S5_6` (Activate)<br>R16892 `city_activate_G3S6_6` (Activate)<br>R16896 `city_activate_G3S7_6` (Activate) |
| 16869 | `city_G4_Start_6` | 391.1, 2.3, 1842.0 | 1 | — | R16780 `city_Gamble_G4_6` (VariableSetRandom)<br>R16873 `city_activate_G4S1_6` (Activate)<br>R16877 `city_activate_G4S2_6` (Activate)<br>R16881 `city_activate_G4S3_6` (Activate)<br>R16885 `city_activate_G4S4_6` (Activate)<br>R16889 `city_activate_G4S5_6` (Activate)<br>R16893 `city_activate_G4S6_6` (Activate)<br>R16897 `city_activate_G4S7_6` (Activate) |
| 16898 | `city_coll_Death_G3_6` | 921.3, 157.8, 1225.0 | 10 | — | R16903 `city_death_g3_6` (Death) |
| 16899 | `city_coll_Death_G1_6` | 921.3, 157.8, 1225.2 | 10 | — | R16837 `city_death_g1_6` (Death) |
| 16900 | `city_coll_Death_G4_6` | 921.0, 157.8, 1225.1 | 10 | — | R16904 `city_death_g4_6` (Death) |
| 16901 | `city_coll_Death_G2_6` | 921.2, 157.8, 1225.1 | 10 | — | R16902 `city_death_g2_6` (Death) |
| 16905 | `city_teleporter_destination_6` | 921.9, 157.7, 1224.4 | 1 | — | — |
| 16907 | `city_s1_Death_6` | 118.8, 2.3, 2237.3 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16908 | `city_s2_Death_6` | 99.5, 2.3, 2078.4 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16909 | `city_s3_Death_6` | 91.8, 2.3, 1938.9 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16910 | `city_s4_Death_6` | 155.8, 2.3, 1853.1 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16911 | `city_s5_Death_6` | 317.5, 2.3, 1846.4 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16912 | `city_s6_Death_6` | 598.4, 2.3, 2228.9 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16913 | `city_s7_Death_6` | 346.2, 2.3, 2466.8 | 10 | — | R16906 `city_teleport_vehicle_6` (Teleport) |
| 16926 | `city_Junction_6` | 171.5, 2.3, 2205.4 | 1 | — | R17026 `city_Gamble_J1_6` (VariableSetRandom)<br>R16986 `city_Activate_J1-1A_6` (Activate)<br>R16985 `city_Activate_J1-1B_6` (Activate) |
| 16927 | `city_Junction_6` | 187.5, 2.3, 2234.8 | 1 | — | R17027 `city_Gamble_J2_6` (VariableSetRandom)<br>R16988 `city_Activate_J2-1A_6` (Activate)<br>R16987 `city_Activate_J2-5B_6` (Activate) |
| 16928 | `city_Junction_6` | 331.3, 2.3, 2226.0 | 40 | — | R17029 `city_Gamble_J4_6` (VariableSetRandom)<br>R16990 `city_Activate_J4-1A_6` (Activate)<br>R16991 `city_Activate_J4-2B_6` (Activate)<br>R16993 `city_Activate_J4-3A_6` (Activate)<br>R16992 `city_Activate_J4-4B_6` (Activate) |
| 16929 | `city_Junction_6` | 315.2, 2.3, 2080.3 | 1 | — | R17032 `city_Gamble_J7_6` (VariableSetRandom)<br>R16998 `city_Activate_J7-2B_6` (Activate)<br>R16999 `city_Activate_J7-6A_6` (Activate) |
| 16930 | `city_Junction_6` | 337.0, 2.3, 2055.1 | 1 | — | R17031 `city_Gamble_J6_6` (VariableSetRandom)<br>R16996 `city_Activate_J6-2A_6` (Activate)<br>R16997 `city_Activate_J6-6A_6` (Activate) |
| 16931 | `city_Junction_6` | 306.9, 2.3, 2062.8 | 1 | — | R17030 `city_Gamble_J5_6` (VariableSetRandom)<br>R16995 `city_Activate_J5-2A_6` (Activate)<br>R16994 `city_Activate_J5-2B_6` (Activate) |
| 16932 | `city_Junction_6` | 314.5, 2.3, 1940.3 | 1 | — | R17035 `city_Gamble_J10_6` (VariableSetRandom)<br>R17004 `city_Activate_J10-2B_6` (Activate)<br>R17005 `city_Activate_J10-7A_6` (Activate) |
| 16933 | `city_Junction_6` | 336.0, 2.3, 1917.2 | 1 | — | R17034 `city_Gamble_J9_6` (VariableSetRandom)<br>R17002 `city_Activate_J9-2A_6` (Activate)<br>R17003 `city_Activate_J9-7A_6` (Activate) |
| 16934 | `city_Junction_6` | 306.4, 2.3, 1922.5 | 1 | — | R17033 `city_Gamble_J8_6` (VariableSetRandom)<br>R17001 `city_Activate_J8-2A_6` (Activate)<br>R17000 `city_Activate_J8-2B_6` (Activate) |
| 16935 | `city_Junction_6` | 179.3, 2.3, 1932.7 | 1 | — | R17036 `city_Gamble_J11_6` (VariableSetRandom)<br>R17008 `city_Activate_J11-5A_6` (Activate)<br>R17006 `city_Activate_J11-5B_6` (Activate)<br>R17007 `city_Activate_J11-7A_6` (Activate) |
| 16936 | `city_Junction_6` | 172.5, 2.3, 1916.7 | 1 | — | R17038 `city_Gamble_J13_6` (VariableSetRandom)<br>R17012 `city_Activate_J13-5A_6` (Activate)<br>R17013 `city_Activate_J13-7A_6` (Activate) |
| 16937 | `city_Junction_6` | 163.3, 2.3, 1939.6 | 1 | — | R17037 `city_Gamble_J12_6` (VariableSetRandom)<br>R17011 `city_Activate_J12-5B_6` (Activate)<br>R17010 `city_Activate_J12-7A_6` (Activate)<br>R17009 `city_Activate_J12-7B_6` (Activate) |
| 16938 | `city_Junction_6` | 157.4, 2.3, 2216.2 | 1 | — | R17028 `city_Gamble_J3_6` (VariableSetRandom)<br>R17043 `city_Activate_J3-1B_6` (Activate)<br>R16989 `city_Activate_J3-5B_6` (Activate) |
| 16939 | `city_Junction_6` | 172.2, 2.3, 2053.7 | 1 | — | R17039 `city_Gamble_J14_6` (VariableSetRandom)<br>R17016 `city_Activate_J14-5A_6` (Activate)<br>R17014 `city_Activate_J14-6A_6` (Activate)<br>R17015 `city_Activate_J14-6B_6` (Activate) |
| 16940 | `city_Junction_6` | 155.9, 2.3, 2063.2 | 1 | — | R17042 `city_Gamble_J17_6` (VariableSetRandom)<br>R17023 `city_Activate_J17-5A_6` (Activate)<br>R17025 `city_Activate_J17-5B_6` (Activate)<br>R17024 `city_Activate_J17-6B_6` (Activate) |
| 16941 | `city_Junction_6` | 162.7, 2.3, 2078.5 | 1 | — | R17040 `city_Gamble_J15_6` (VariableSetRandom)<br>R17017 `city_Activate_J15-5B_6` (Activate)<br>R17018 `city_Activate_J15-6A_6` (Activate)<br>R17019 `city_Activate_J15-6B_6` (Activate) |
| 16942 | `city_Junction_6` | 178.6, 2.3, 2072.5 | 1 | — | R17041 `city_Gamble_J16_6` (VariableSetRandom)<br>R17021 `city_Activate_J16-5B_6` (Activate)<br>R17020 `city_Activate_J16-6A_6` (Activate)<br>R17022 `city_Activate_J16-5A_6` (Activate) |
| 16943 | `city_rem_J1_1A_6` | 183.6, 2.3, 2196.9 | 1 | city_J1_6 GreaterThan city_half_6 | R16914 `city_pathchange_1A_6` (SetPath) |
| 16944 | `city_rem_J1_1B_6` | 183.1, 2.3, 2200.6 | 1 | city_J1_6 LessThanOrEqualTo city_half_6 | R16915 `city_pathchange_1B_6` (SetPath) |
| 16945 | `city_rem_J2_5B_6` | 195.9, 2.3, 2245.6 | 1 | city_J2_6 LessThanOrEqualTo city_half_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16946 | `city_rem_J2_1A_6` | 196.2, 2.3, 2250.0 | 1 | city_J2_6 GreaterThan city_half_6 | R16914 `city_pathchange_1A_6` (SetPath) |
| 16947 | `city_rem_J3_5B_6` | 160.1, 2.3, 2213.3 | 1 | city_J3_6 LessThanOrEqualTo city_half_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16948 | `city_rem_J3_1B_6` | 159.9, 2.3, 2217.9 | 1 | city_J3_6 GreaterThan city_half_6 | R16915 `city_pathchange_1B_6` (SetPath) |
| 16949 | `city_rem_J4_1A_6` | 297.2, 2.3, 2208.7 | 1 | city_J4_6 LessThanOrEqualTo city_quarter_6 | R16914 `city_pathchange_1A_6` (SetPath) |
| 16950 | `city_rem_J4_2B_6` | 298.8, 2.3, 2206.4 | 1 | city_J4_6 GreaterThan city_quarter_6; city_J4_6 LessThanOrEqualTo city_half_6 | R16917 `city_pathchange_2B_6` (SetPath) |
| 16951 | `city_rem_J4_4B_6` | 301.6, 2.3, 2203.8 | 1 | city_J4_6 GreaterThan city_half_6; city_J4_6 LessThanOrEqualTo city_3quarter_6 | R16919 `city_pathchange_4B_6` (SetPath) |
| 16952 | `city_rem_J4_3A_6` | 304.3, 2.3, 2201.1 | 1 | city_J4_6 GreaterThan city_3quarter_6 | R16918 `city_pathchange_3A_6` (SetPath) |
| 16953 | `city_rem_J5_2A_6` | 301.8, 2.3, 2071.3 | 1 | city_J5_6 GreaterThan city_half_6 | R16916 `city_pathchange_2A_6` (SetPath) |
| 16954 | `city_rem_J5_2B_6` | 304.9, 2.3, 2068.1 | 1 | city_J5_6 LessThanOrEqualTo city_half_6 | R16917 `city_pathchange_2B_6` (SetPath) |
| 16955 | `city_rem_J7_6A_6` | 312.8, 2.3, 2086.5 | 1 | city_J7_6 GreaterThan city_half_6 | R16922 `city_pathchange_6A_6` (SetPath) |
| 16956 | `city_rem_J7_2B_6` | 316.4, 2.3, 2086.9 | 1 | city_J7_6 LessThanOrEqualTo city_half_6 | R16917 `city_pathchange_2B_6` (SetPath) |
| 16957 | `city_rem_J6_2A_6` | 353.4, 2.3, 2061.9 | 1 | city_J6_6 LessThanOrEqualTo city_half_6 | R16916 `city_pathchange_2A_6` (SetPath) |
| 16958 | `city_rem_J6_6A_6` | 349.9, 2.3, 2062.9 | 1 | city_J6_6 GreaterThan city_half_6 | R16922 `city_pathchange_6A_6` (SetPath) |
| 16959 | `city_rem_J10_7A_6` | 311.8, 2.3, 1956.3 | 1 | city_J10_6 GreaterThan city_half_6 | R16924 `city_pathchange_7A_6` (SetPath) |
| 16960 | `city_rem_J10_2B_6` | 315.2, 2.3, 1957.1 | 1 | city_J10_6 LessThanOrEqualTo city_half_6 | R16917 `city_pathchange_2B_6` (SetPath) |
| 16961 | `city_rem_J8_2B_6` | 300.2, 2.3, 1925.5 | 1 | city_J8_6 LessThanOrEqualTo city_half_6 | R16917 `city_pathchange_2B_6` (SetPath) |
| 16962 | `city_rem_J8_2A_6` | 298.3, 2.3, 1929.7 | 1 | city_J8_6 GreaterThan city_half_6 | R16916 `city_pathchange_2A_6` (SetPath) |
| 16963 | `city_rem_J9_7A_6` | 347.4, 2.3, 1919.5 | 1 | city_J9_6 GreaterThan city_half_6 | R16924 `city_pathchange_7A_6` (SetPath) |
| 16964 | `city_rem_J9_2A_6` | 351.5, 2.3, 1919.3 | 1 | city_J9_6 LessThanOrEqualTo city_half_6 | R16916 `city_pathchange_2A_6` (SetPath) |
| 16965 | `city_rem_J11_5A_6` | 195.1, 2.3, 1942.2 | 1 | city_J11_6 GreaterThan city_2third_6 | R16920 `city_pathchange_5A_6` (SetPath) |
| 16966 | `city_rem_J11_7A_6` | 196.0, 2.3, 1938.7 | 1 | city_J11_6 GreaterThan city_1third_6; city_J11_6 LessThanOrEqualTo city_2third_6 | R16924 `city_pathchange_7A_6` (SetPath) |
| 16967 | `city_rem_J11_5B_6` | 192.6, 2.3, 1936.5 | 1 | city_J11_6 LessThanOrEqualTo city_1third_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16968 | `city_rem_J13_7A_6` | 183.3, 2.3, 1914.6 | 1 | city_J13_6 GreaterThan city_half_6 | R16924 `city_pathchange_7A_6` (SetPath) |
| 16969 | `city_rem_J13_5A_6` | 182.7, 2.3, 1918.7 | 1 | city_J13_6 LessThanOrEqualTo city_half_6 | R16920 `city_pathchange_5A_6` (SetPath) |
| 16970 | `city_rem_J12_5B_6` | 173.3, 2.3, 1950.4 | 1 | city_J12_6 GreaterThan city_2third_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16971 | `city_rem_J12_7B_6` | 173.0, 2.3, 1945.6 | 1 | city_J12_6 LessThanOrEqualTo city_1third_6 | R16925 `city_pathchange_7B_6` (SetPath) |
| 16972 | `city_rem_J12_7A_6` | 168.6, 2.3, 1945.0 | 1 | city_J12_6 GreaterThan city_1third_6; city_J12_6 LessThanOrEqualTo city_2third_6 | R16924 `city_pathchange_7A_6` (SetPath) |
| 16973 | `city_rem_J14_5A_6` | 178.0, 2.3, 2052.7 | 1 | city_J14_6 GreaterThan city_2third_6 | R16920 `city_pathchange_5A_6` (SetPath) |
| 16974 | `city_rem_J14_6A_6` | 178.0, 2.3, 2057.2 | 1 | city_J14_6 LessThanOrEqualTo city_1third_6 | R16922 `city_pathchange_6A_6` (SetPath) |
| 16975 | `city_rem_J14_6B_6` | 181.0, 2.3, 2058.0 | 1 | city_J14_6 GreaterThan city_1third_6; city_J14_6 LessThanOrEqualTo city_2third_6 | R16923 `city_pathchange_6B_6` (SetPath) |
| 16976 | `city_rem_J17_6B_6` | 157.7, 2.3, 2064.3 | 1 | city_J17_6 LessThanOrEqualTo city_2third_6; city_J17_6 GreaterThan city_1third_6 | R16923 `city_pathchange_6B_6` (SetPath) |
| 16977 | `city_rem_J17_5B_6` | 161.7, 2.3, 2064.7 | 1 | city_J17_6 GreaterThan city_2third_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16978 | `city_rem_J17_5A_6` | 161.3, 2.3, 2070.0 | 1 | city_J17_6 LessThanOrEqualTo city_1third_6 | R16920 `city_pathchange_5A_6` (SetPath) |
| 16979 | `city_rem_J15_6A_6` | 166.4, 2.3, 2084.4 | 1 | city_J15_6 LessThanOrEqualTo city_2third_6; city_J15_6 GreaterThan city_1third_6 | R16922 `city_pathchange_6A_6` (SetPath) |
| 16980 | `city_rem_J15_6B_6` | 170.1, 2.3, 2084.6 | 1 | city_J15_6 GreaterThan city_2third_6 | R16923 `city_pathchange_6B_6` (SetPath) |
| 16981 | `city_rem_J15_5B_6` | 170.6, 2.3, 2089.6 | 1 | city_J15_6 LessThanOrEqualTo city_1third_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16982 | `city_rem_J16_5B_6` | 186.4, 2.3, 2076.8 | 1 | city_J16_6 LessThanOrEqualTo city_2third_6; city_J16_6 GreaterThan city_1third_6 | R16921 `city_pathchange_5B_6` (SetPath) |
| 16983 | `city_rem_J16_5A_6` | 186.5, 2.3, 2081.3 | 1 | city_J16_6 GreaterThan city_2third_6 | R16920 `city_pathchange_5A_6` (SetPath) |
| 16984 | `city_rem_J16_6A_6` | 191.2, 2.3, 2082.0 | 1 | city_J16_6 LessThanOrEqualTo city_1third_6 | R16922 `city_pathchange_6A_6` (SetPath) |

### Boost ramps (`tsp_`) (5 triggers)

| COID | Name | Position | Scale | Conditions | Reactions |
|------|------|----------|-------|------------|-----------|
| 7985 | `tsp_col_Ramp_Flash` | 727.3, 8.2, 160.1 | 35 | — | R7991 `tsp_Ramp_activate_Lights` (Activate)<br>R7989 `tsp_Ramp_Delete_Lights` (Delete) |
| 7986 | `tsp_rem_Ramp_createlights` | 718.3, 8.2, 150.7 | 1 | — | R7990 `tsp_Ramp_Create_Lights` (Create) |
| 7987 | `tsp_col_Ramp_BOOST` | 703.3, 8.2, 160.2 | 6 | — | — |
| 15061 | `tsp_col_Ramp_BOOST_3` | 340.9, 20.3, 723.3 | 4.4999943 | — | R15060 `l1_boost_01` (Boost) |
| 18041 | `tsp_col_Ramp_BOOST_3` | 469.2, 22.1, 554.3 | 6 | — | R18042 `l1_boost_02` (Boost) |

<!-- /AUTO:triggers -->

## Appendix C — Reactions (complete)

<!-- AUTO:reactions -->
### Activate (134)

| COID | Name | Fields |
|------|------|--------|
| 7991 | `tsp_Ramp_activate_Lights` | targets=#7986 tsp_rem_Ramp_createlights |
| 8039 | `tsp_Ramp_activate_Lights_2` | — |
| 14101 | `l1_act_door1_actuator` | targets=#14100 L1_rem_setvar_door1 |
| 14118 | `l1_act_door2_actuator` | targets=#14119 L1_rem_setvar_door2, #16428 L1_rem_door2_delete_physics |
| 14142 | `l1_act_gunny1` | targets=#14138 ed_spawn_point_placeholder |
| 15826 | `l1_act_door3_airlock_fxend` | targets=#15825 L1_rem_endfx_airlock |
| 15827 | `l1_act_door3_airlock_fxstart` | targets=#15824 L1_rem_airlock_sequence |
| 15844 | `l1_act_scavsambush` | targets=#15821 L1_rem_summonscavs |
| 16227 | `L0_act_1xload_withitem_5` | targets=#16226 L1_rem_1xload_startskipchoice_5 |
| 16230 | `l1_act_nagline_5_b` | targets=#16229 L1_rem_onload_fornaglines_5 |
| 16232 | `l1_act_nagline_repeat_5` | targets=#16231 L1_rem_activate_nagline_5 |
| 16235 | `l1_act_nagline_5` | targets=#16234 L1_rem_activate_nagline_5 |
| 16252 | `l1_act_condenser_usefx` | targets=#16251 l1_rem_setvar_condensersafety |
| 16264 | `l1_act_door2_fx_close` | targets=#16262 L1_rem_opendoor_2_fxclose |
| 16278 | `l1_act_door_2_completer` | targets=#16276 l1_rem_door_2_fx_complete |
| 16283 | `l1_act_gunny_start` | targets=#14134 l1_rem_gunnysioux_initiator |
| 16285 | `l1_act_gunnycreate_setvar` | targets=#16284 L1_rem_setvar_gunnysafety |
| 16307 | `l1_act_door1_physics_remover` | targets=#16305 l1_rem_door1_physics |
| 16336 | `l1_act_door1_2_physics_remover` | targets=#16308 L1_rem_door1_2-physics |
| 16344 | `l1_act_airlock_close_final` | targets=#16343 L1_rem_airlock_close_final |
| 16379 | `L1_act_airlock_door1_fx` | targets=#16375 L1_rem_airlockdoor_1_openfx |
| 16381 | `l1_act_airlock_door_1_fx_2` | targets=#16376 L1_rem_airlockdoor_1_openfx_2 |
| 16401 | `l1_act_airlock_coll1_1` | targets=#16378 l1_rem_airlock_coll1_1 |
| 16402 | `l1_act_airlock_coll1_2` | targets=#16382 l1_rem_airlock_coll1_2 |
| 16410 | `l1_act_airlock_coll2_1` | targets=#16384 l1_rem_airlock_coll2_1 |
| 16412 | `l1_act_airlock_coll2_2` | targets=#16383 l1_rem_coll2_2 |
| 16415 | `L0_act_airlock_coll3_1` | targets=#16386 l1_rem_airlock_coll3_1 |
| 16419 | `l1_act_airlock_coll4_1` | targets=#16388 l1_rem_airlock_coll4_1 |
| 16468 | `l1_act_gunnyheal_1` | targets=#16465 L1_rem_gunnyheal_init |
| 16471 | `l1_act_heal_final` | targets=#16470 L1_rem_heal_repeater copy |
| 16480 | `l1_act_castthepain` | targets=#16479 l1_rem_setvar_painhascast |
| 16561 | `l1_act_door2_close_final` | targets=#16560 L1_door_2_closed |
| 16594 | `l1_act_cavein_triggers` | targets=#16590 l1_rem_fx_cleanup_cavein |
| 16598 | `l1_act_cavein_cleanup` | targets=#16596 l1_rem_fx_cleanup_cavein_2 |
| 16788 | `city_G1_S1_Activate_6` | targets=#16749 ed_spawn_point_placeholder |
| 16789 | `city_G1_S2_Activate_6` | targets=#16750 ed_spawn_point_placeholder |
| 16790 | `city_G1_S3_Activate_6` | targets=#16751 ed_spawn_point_placeholder |
| 16791 | `city_G1_S4_Activate_6` | targets=#16752 ed_spawn_point_placeholder |
| 16792 | `city_G1_S5_Activate_6` | targets=#16753 ed_spawn_point_placeholder |
| 16793 | `city_G1_S6_Activate_6` | targets=#16754 ed_spawn_point_placeholder |
| 16794 | `city_G1_S7_Activate_6` | targets=#16755 ed_spawn_point_placeholder |
| 16795 | `city_G2_S1_Activate_6` | targets=#16756 ed_spawn_point_placeholder |
| 16817 | `city_G2_S2_Activate_6` | targets=#16757 ed_spawn_point_placeholder |
| 16818 | `city_G2_S3_Activate_6` | targets=#16758 ed_spawn_point_placeholder |
| 16819 | `city_G2_S4_Activate_6` | targets=#16759 ed_spawn_point_placeholder |
| 16820 | `city_G2_S5_Activate_6` | targets=#16760 ed_spawn_point_placeholder |
| 16821 | `city_G2_S6_Activate_6` | targets=#16761 ed_spawn_point_placeholder |
| 16822 | `city_G2_S7_Activate_6` | targets=#16762 ed_spawn_point_placeholder |
| 16824 | `city_G3_S2_Activate_6` | targets=#16764 ed_spawn_point_placeholder |
| 16825 | `city_G3_S3_Activate_6` | targets=#16765 ed_spawn_point_placeholder |
| 16826 | `city_G3_S4_Activate_6` | targets=#16766 ed_spawn_point_placeholder |
| 16827 | `city_G3_S5_Activate_6` | targets=#16767 ed_spawn_point_placeholder |
| 16829 | `city_G3_S7_Activate_6` | targets=#16769 ed_spawn_point_placeholder |
| 16830 | `city_G4_S1_Activate_6` | targets=#16770 ed_spawn_point_placeholder |
| 16831 | `city_G4_S2_Activate_6` | targets=#16771 ed_spawn_point_placeholder |
| 16832 | `city_G4_S3_Activate_6` | targets=#16772 ed_spawn_point_placeholder |
| 16833 | `city_G4_S4_Activate_6` | targets=#16773 ed_spawn_point_placeholder |
| 16834 | `city_G4_S5_Activate_6` | targets=#16774 ed_spawn_point_placeholder |
| 16835 | `city_G4_S6_Activate_6` | targets=#16775 ed_spawn_point_placeholder |
| 16836 | `city_G4_S7_Activate_6` | targets=#16776 ed_spawn_point_placeholder |
| 16870 | `city_activate_G1S1_6` | targets=#16838 city_G1S1_Activate_6 |
| 16871 | `city_activate_G2S1_6` | targets=#16839 city_G2S1_Activate_6 |
| 16872 | `city_activate_G3S1_6` | targets=#16840 city_G3S1_Activate_6 |
| 16873 | `city_activate_G4S1_6` | targets=#16841 city_G4S1_Activate_6 |
| 16874 | `city_activate_G1S2_6` | targets=#16842 city_G1S2_Activate_6 |
| 16875 | `city_activate_G2S2_6` | targets=#16845 city_G2S2_Activate_6 |
| 16876 | `city_activate_G3S2_6` | targets=#16843 city_G3S2_Activate_6 |
| 16877 | `city_activate_G4S2_6` | targets=#16844 city_G4S2_Activate_6 |
| 16878 | `city_activate_G1S3_6` | targets=#16846 city_G1S3_Activate_6 |
| 16879 | `city_activate_G2S3_6` | targets=#16849 city_G2S3_Activate_6 |
| 16880 | `city_activate_G3S3_6` | targets=#16843 city_G3S2_Activate_6 |
| 16881 | `city_activate_G4S3_6` | targets=#16847 city_G3S3_Activate_6 |
| 16882 | `city_activate_G1S4_6` | targets=#16850 city_G1S4_Activate_6 |
| 16883 | `city_activate_G2S4_6` | targets=#16853 city_G2S4_Activate_6 |
| 16884 | `city_activate_G3S4_6` | targets=#16851 city_G3S4_Activate_6 |
| 16885 | `city_activate_G4S4_6` | targets=#16852 city_G4S4_Activate_6 |
| 16886 | `city_activate_G1S5_6` | targets=#16854 city_G1S5_Activate_6 |
| 16887 | `city_activate_G2S5_6` | targets=#16857 city_G2S5_Activate_6 |
| 16888 | `city_activate_G3S5_6` | targets=#16855 city_G3S5_Activate_6 |
| 16889 | `city_activate_G4S5_6` | targets=#16856 city_G4S5_Activate_6 |
| 16890 | `city_activate_G1S6_6` | targets=#16858 city_G1S6_Activate_6 |
| 16891 | `city_activate_G2S6_6` | targets=#16861 city_G2S6_Activate_6 |
| 16892 | `city_activate_G3S6_6` | targets=#16859 city_G3S6_Activate_6 |
| 16893 | `city_activate_G4S6_6` | targets=#16860 city_G4S6_Activate_6 |
| 16894 | `city_activate_G1S7_6` | targets=#16862 city_G1S7_Activate_6 |
| 16895 | `city_activate_G2S7_6` | targets=#16865 city_G2S7_Activate_6 |
| 16896 | `city_activate_G3S7_6` | targets=#16863 city_G3S7_Activate_6 |
| 16897 | `city_activate_G4S7_6` | targets=#16864 city_G4S7_Activate_6 |
| 16985 | `city_Activate_J1-1B_6` | targets=#16944 city_rem_J1_1B_6 |
| 16986 | `city_Activate_J1-1A_6` | targets=#16943 city_rem_J1_1A_6 |
| 16987 | `city_Activate_J2-5B_6` | targets=#16945 city_rem_J2_5B_6 |
| 16988 | `city_Activate_J2-1A_6` | targets=#16946 city_rem_J2_1A_6 |
| 16989 | `city_Activate_J3-5B_6` | targets=#16947 city_rem_J3_5B_6 |
| 16990 | `city_Activate_J4-1A_6` | targets=#16949 city_rem_J4_1A_6 |
| 16991 | `city_Activate_J4-2B_6` | targets=#16950 city_rem_J4_2B_6 |
| 16992 | `city_Activate_J4-4B_6` | targets=#16951 city_rem_J4_4B_6 |
| 16993 | `city_Activate_J4-3A_6` | targets=#16952 city_rem_J4_3A_6 |
| 16994 | `city_Activate_J5-2B_6` | targets=#16954 city_rem_J5_2B_6 |
| 16995 | `city_Activate_J5-2A_6` | targets=#16953 city_rem_J5_2A_6 |
| 16996 | `city_Activate_J6-2A_6` | targets=#16957 city_rem_J6_2A_6 |
| 16997 | `city_Activate_J6-6A_6` | targets=#16958 city_rem_J6_6A_6 |
| 16998 | `city_Activate_J7-2B_6` | targets=#16956 city_rem_J7_2B_6 |
| 16999 | `city_Activate_J7-6A_6` | targets=#16955 city_rem_J7_6A_6 |
| 17000 | `city_Activate_J8-2B_6` | targets=#16961 city_rem_J8_2B_6 |
| 17001 | `city_Activate_J8-2A_6` | targets=#16962 city_rem_J8_2A_6 |
| 17002 | `city_Activate_J9-2A_6` | targets=#16964 city_rem_J9_2A_6 |
| 17003 | `city_Activate_J9-7A_6` | targets=#16963 city_rem_J9_7A_6 |
| 17004 | `city_Activate_J10-2B_6` | targets=#16960 city_rem_J10_2B_6 |
| 17005 | `city_Activate_J10-7A_6` | targets=#16959 city_rem_J10_7A_6 |
| 17006 | `city_Activate_J11-5B_6` | targets=#16967 city_rem_J11_5B_6 |
| 17007 | `city_Activate_J11-7A_6` | targets=#16966 city_rem_J11_7A_6 |
| 17008 | `city_Activate_J11-5A_6` | targets=#16965 city_rem_J11_5A_6 |
| 17009 | `city_Activate_J12-7B_6` | targets=#16971 city_rem_J12_7B_6 |
| 17010 | `city_Activate_J12-7A_6` | targets=#16972 city_rem_J12_7A_6 |
| 17011 | `city_Activate_J12-5B_6` | targets=#16970 city_rem_J12_5B_6 |
| 17012 | `city_Activate_J13-5A_6` | targets=#16969 city_rem_J13_5A_6 |
| 17013 | `city_Activate_J13-7A_6` | targets=#16968 city_rem_J13_7A_6 |
| 17014 | `city_Activate_J14-6A_6` | targets=#16974 city_rem_J14_6A_6 |
| 17015 | `city_Activate_J14-6B_6` | targets=#16975 city_rem_J14_6B_6 |
| 17016 | `city_Activate_J14-5A_6` | targets=#16973 city_rem_J14_5A_6 |
| 17017 | `city_Activate_J15-5B_6` | targets=#16981 city_rem_J15_5B_6 |
| 17018 | `city_Activate_J15-6A_6` | targets=#16979 city_rem_J15_6A_6 |
| 17019 | `city_Activate_J15-6B_6` | targets=#16980 city_rem_J15_6B_6 |
| 17020 | `city_Activate_J16-6A_6` | targets=#16984 city_rem_J16_6A_6 |
| 17021 | `city_Activate_J16-5B_6` | targets=#16982 city_rem_J16_5B_6 |
| 17022 | `city_Activate_J16-5A_6` | targets=#16983 city_rem_J16_5A_6 |
| 17023 | `city_Activate_J17-5A_6` | targets=#16978 city_rem_J17_5A_6 |
| 17024 | `city_Activate_J17-6B_6` | targets=#16976 city_rem_J17_6B_6 |
| 17025 | `city_Activate_J17-5B_6` | targets=#16977 city_rem_J17_5B_6 |
| 17043 | `city_Activate_J3-1B_6` | targets=#16948 city_rem_J3_1B_6 |
| 17897 | `l0_invul_morestuff` | — |
| 17904 | `l1_airlock_activateremtrig` | targets=#17903 l1_rem_airlockstationary |
| 17907 | `New Reaction` | — |
| 17921 | `l1_act_repairbind_outside` | targets=#17920 l0_rem_markrepair |

### AddXP (1)

| COID | Name | Fields |
|------|------|--------|
| 16223 | `L1_givexp` | gv1=l0_cons_1000 (215) |

### Boost (3)

| COID | Name | Fields |
|------|------|--------|
| 7988 | `tsp_Ramp_Boost` | gv1=tsp_Boost_01 (1) |
| 15060 | `l1_boost_01` | gv1=tsp_Boost_01 (1) |
| 18042 | `l1_boost_02` | gv1=tsp_boost_02 (219) |

### CompleteObjective (16)

| COID | Name | Fields |
|------|------|--------|
| 15832 | `l1_completeobjective_scabfield` | gv1=5467 |
| 16237 | `l1_completeobjective_guns_1` | gv1=5421 |
| 16565 | `L1_completeobj_livenaddirect_patrol7` | gv1=5430 |
| 17188 | `L1_completeobj_livenaddirect_patrol8` | gv1=5431 |
| 17189 | `L1_completeobj_livenaddirect_patrol9` | gv1=5432 |
| 17190 | `L1_completeobj_livenaddirect_patrol10` | gv1=5433 |
| 17191 | `L1_completeobj_livenaddirect_patrol11` | gv1=5434 |
| 17192 | `L1_completeobj_livenaddirect_patrol12` | gv1=5530 |
| 17193 | `L1_completeobj_livenaddirect_patrol13` | gv1=5531 |
| 17194 | `L1_completeobj_livenaddirect_patrol14` | gv1=5532 |
| 17195 | `L1_completeobj_livenaddirect_patrol15` | gv1=5533 |
| 17300 | `L1_completeobj_livenaddirect_patrol6` | gv1=5429 |
| 17301 | `L1_completeobj_livenaddirect_patrol5` | gv1=5428 |
| 17302 | `L1_completeobj_livenaddirect_patrol4` | gv1=5427 |
| 17303 | `L1_completeobj_livenaddirect_patrol3` | gv1=5426 |
| 17304 | `L1_completeobj_livenaddirect_patrol2` | gv1=5425 |

### Create (79)

| COID | Name | Fields |
|------|------|--------|
| 7990 | `tsp_Ramp_Create_Lights` | targets=#4259 obj_gen_n_static_str_01_lights-human-sphere, #4258 obj_gen_n_static_str_01_lights-human-sphere, #4254 obj_gen_n_static_str_01_lights-human-sphere, #4255 obj_gen_n_static_str_01_lights-human-sphere… |
| 8038 | `tsp_Ramp_Create_Lights_2` | — |
| 14139 | `l1_create_gunny1` | targets=#14138 ed_spawn_point_placeholder |
| 15819 | `l1_create_gunny2` | targets=#15820 ed_spawn_point_placeholder, #16462 veh_a_h_c_cha_01_gunnygunny, #16500 veh_a_h_o_cha_01_armsman-gunny_inc_husk |
| 15843 | `l1_create_surplusscavs` | targets=#15842 ed_spawn_point_placeholder, #15839 ed_spawn_point_placeholder, #15840 ed_spawn_point_placeholder, #15841 ed_spawn_point_placeholder… |
| 16247 | `l1_create_use_condenser_fx` | targets=#16248 sec_fx_blackmist, #16244 sec_fx_artillery_2, #16249 sec_fx_smoke01, #16255 sec_fx_sparks_green… |
| 16253 | `l1_create_condenser_deathfx` | targets=#16245 sec_fx_artillery_3, #16243 sec_fx_artillery |
| 16261 | `l1_create_door_2_fx` | targets=#16270 sec_fx_steam01, #16257 sec_fx_steam01, #16260 sec_fx_steam01, #16258 sec_fx_steam01 |
| 16275 | `l1_create_door_2_fx_2` | targets=#16271 sec_fx_steam01, #16274 sec_fx_steam01, #16272 sec_fx_steam01, #16273 sec_fx_steam01 |
| 16291 | `l1_create_bridges_broken` | targets=#16293 obj_gen_n_static_str_01_brick-rubble-03, #16289 obj_gen_n_static_str_01_highway-20-long, #16288 obj_gen_n_static_str_01_highway-20-long, #16294 obj_gen_n_static_str_bridge_01_wood-overpass-rubble4… |
| 16338 | `l1_create_door_3_airlock` | targets=#16441 obj_f_h_static_str_01_bigdoor |
| 16345 | `l1_create_door3_airlock_physics` | targets=#16458 invis_physics_10x05rect |
| 16392 | `l1_create_airlock_1_fx_1` | targets=#16391 sec_fx_steam01, #16389 sec_fx_steam01, #16390 sec_fx_steam01 |
| 16394 | `l1_create_airlock_1_fx_2` | targets=#16436 sec_fx_static-discharge, #16395 sec_fx_steam01, #16396 sec_fx_steam01, #16354 sec_fx_static-discharge… |
| 16400 | `l1_create_airlock_collfx_1` | targets=#16355 sec_fx_static-discharge, #16354 sec_fx_static-discharge, #16356 sec_fx_static-discharge, #16357 sec_fx_static-discharge… |
| 16406 | `l1_create_airlock_collfx_3_steam` | targets=#16409 sec_fx_steam01, #16408 sec_fx_steam01, #16367 sec_fx_static-discharge, #16365 sec_fx_static-discharge |
| 16411 | `l1_create_airlock_coll2_fx_1` | targets=#16361 sec_fx_static-discharge, #16363 sec_fx_static-discharge, #16359 sec_fx_static-discharge |
| 16413 | `l1_create_airlock_coll2_fx_2` | targets=#16361 sec_fx_static-discharge, #16363 sec_fx_static-discharge, #16359 sec_fx_static-discharge, #16362 sec_fx_static-discharge… |
| 16417 | `l1_create_airlock_collfx_3_1` | targets=#16366 sec_fx_static-discharge, #16364 sec_fx_static-discharge, #16368 sec_fx_static-discharge, #16439 sec_fx_static-discharge… |
| 16418 | `l1_create_airlock_collfx_3_2` | targets=#16367 sec_fx_static-discharge, #16365 sec_fx_static-discharge, #16370 sec_fx_static-discharge, #16373 sec_fx_static-discharge |
| 16420 | `l1_create_airlock_collfx_4_steam` | targets=#16409 sec_fx_steam01, #16408 sec_fx_steam01, #16367 sec_fx_static-discharge, #16365 sec_fx_static-discharge |
| 16421 | `l1_create_airlock_collfx_4_1` | targets=#16445 sec_fx_static-discharge, #16372 sec_fx_static-discharge, #16374 sec_fx_static-discharge, #16371 sec_fx_static-discharge… |
| 16422 | `l1_create_airlock_collfx_4_2` | targets=#16370 sec_fx_static-discharge, #16373 sec_fx_static-discharge, #16372 sec_fx_static-discharge, #16371 sec_fx_static-discharge |
| 16426 | `l1_create_airlock_finalsteam` | targets=#16371 sec_fx_static-discharge, #16423 sec_fx_steam01, #16424 sec_fx_steam01, #16372 sec_fx_static-discharge |
| 16440 | `l1_create_airlock_extrafx_onsequence` | targets=#16367 sec_fx_static-discharge, #16438 sec_fx_static-discharge, #16439 sec_fx_static-discharge, #16372 sec_fx_static-discharge… |
| 16467 | `l1_create_gunnyheals` | targets=#16461 sec_fx_heal |
| 16555 | `l1_create_door_3_closing` | targets=#16554 obj_gen_tun_con_ang_01_door-55 |
| 16558 | `l1_create_door_2_closing` | targets=#16557 obj_gen_tun_con_ang_01_door-55 |
| 16564 | `l1_create_door2_2_physics` | targets=#16351 invis_physics_10x05rect |
| 16579 | `l1_create_cavein_1` | targets=#16592 sec_fx_artillery, #17403 sec_fx_artillery_2, #17402 sec_fx_artillery_2 |
| 16602 | `l1_create_cavein_residual` | targets=#16615 sec_fx_artillery |
| 16616 | `l1_create_bigsmoke` | — |
| 16781 | `city_G1_S1_Create_6` | targets=#16749 ed_spawn_point_placeholder |
| 16782 | `city_G1_S2_Create_6` | targets=#16750 ed_spawn_point_placeholder |
| 16783 | `city_G1_S3_Create_6` | targets=#16751 ed_spawn_point_placeholder |
| 16784 | `city_G1_S4_Create_6` | targets=#16752 ed_spawn_point_placeholder |
| 16785 | `city_G1_S5_Create_6` | targets=#16753 ed_spawn_point_placeholder |
| 16786 | `city_G1_S6_Create_6` | targets=#16754 ed_spawn_point_placeholder |
| 16787 | `city_G1_S7_Create_6` | targets=#16755 ed_spawn_point_placeholder |
| 16796 | `city_G2_S1_Create_6` | targets=#16756 ed_spawn_point_placeholder |
| 16797 | `city_G2_S2_Create_6` | targets=#16757 ed_spawn_point_placeholder |
| 16798 | `city_G2_S3_Create_6` | targets=#16758 ed_spawn_point_placeholder |
| 16799 | `city_G2_S4_Create_6` | targets=#16759 ed_spawn_point_placeholder |
| 16800 | `city_G2_S5_Create_6` | targets=#16760 ed_spawn_point_placeholder |
| 16801 | `city_G2_S6_Create_6` | targets=#16761 ed_spawn_point_placeholder |
| 16802 | `city_G2_S7_Create_6` | targets=#16762 ed_spawn_point_placeholder |
| 16803 | `city_G3_S1_Create_6` | targets=#16763 ed_spawn_point_placeholder |
| 16804 | `city_G3_S2_Create_6` | targets=#16764 ed_spawn_point_placeholder |
| 16805 | `city_G3_S3_Create_6` | targets=#16765 ed_spawn_point_placeholder |
| 16806 | `city_G3_S4_Create_6` | targets=#16766 ed_spawn_point_placeholder |
| 16807 | `city_G3_S5_Create_6` | targets=#16767 ed_spawn_point_placeholder |
| 16808 | `city_G3_S6_Create_6` | targets=#16768 ed_spawn_point_placeholder |
| 16809 | `city_G3_S7_Create_6` | targets=#16769 ed_spawn_point_placeholder |
| 16810 | `city_G4_S1_Create_6` | targets=#16770 ed_spawn_point_placeholder |
| 16811 | `city_G4_S2_Create_6` | targets=#16771 ed_spawn_point_placeholder |
| 16812 | `city_G4_S3_Create_6` | targets=#16772 ed_spawn_point_placeholder |
| 16813 | `city_G4_S4_Create_6` | targets=#16773 ed_spawn_point_placeholder |
| 16814 | `city_G4_S5_Create_6` | targets=#16774 ed_spawn_point_placeholder |
| 16815 | `city_G4_S6_Create_6` | targets=#16775 ed_spawn_point_placeholder |
| 16816 | `city_G4_S7_Create_6` | targets=#16776 ed_spawn_point_placeholder |
| 16823 | `city_G3_S1_Activate_6` | targets=#16763 ed_spawn_point_placeholder |
| 16828 | `city_G3_S6_Activate_6` | targets=#16768 ed_spawn_point_placeholder |
| 17144 | `distance_Tier1_Create` | — |
| 17146 | `distance_Tier2_Create` | — |
| 17148 | `distance_Tier3_Create` | — |
| 17299 | `l1_create_door3_end_airlock_physics` | targets=#16339 invis_physics_10x05rect |
| 17327 | `l1_create_t1Door` | targets=#17337 invis_physics_10x05rect, #17324 obj_gen_tun_con_ang_01_door-closed-55 |
| 17328 | `l1_create_t2Door` | targets=#17325 obj_gen_tun_con_ang_01_door-closed-55, #17336 invis_physics_10x05rect |
| 17349 | `l1_create_artilerylol` | targets=#17347 sec_fx_artillery_2 |
| 17876 | `l1_door5_createcorners` | targets=#17874 invis_physics_10x05rect, #17875 invis_physics_10x05rect, #17872 invis_physics_10x05rect, #17873 invis_physics_10x05rect |
| 17881 | `l1_door4_createcorners` | targets=#17878 invis_physics_10x05rect, #17877 invis_physics_10x05rect, #17879 invis_physics_10x05rect, #17880 invis_physics_10x05rect |
| 17886 | `l1_door3_createcorners` | targets=#17883 invis_physics_10x05rect, #17882 invis_physics_10x05rect, #17884 invis_physics_10x05rect, #17885 invis_physics_10x05rect |
| 17891 | `l1_door2_createcorners` | targets=#17888 invis_physics_10x05rect, #17887 invis_physics_10x05rect, #17889 invis_physics_10x05rect, #17890 invis_physics_10x05rect |
| 17896 | `l1_door1_createcorners` | targets=#17895 invis_physics_10x05rect, #17892 invis_physics_10x05rect, #17893 invis_physics_10x05rect, #17894 invis_physics_10x05rect |
| 17905 | `l1_airlock_createstationarydoor` | — |
| 17909 | `l1_airlock_createclosingdoor` | targets=#16441 obj_f_h_static_str_01_bigdoor |
| 17926 | `BIGDOOR_l0_create_staticcloseddoor` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 17928 | `BIGDOOR_l0_create_openingdoor` | targets=#17925 obj_f_h_static_str_01_bigdoor-o |
| 17930 | `BIGDOOR_l0_create_closingdoor` | targets=#16441 obj_f_h_static_str_01_bigdoor |

### Death (20)

| COID | Name | Fields |
|------|------|--------|
| 14098 | `l1_death_opendoor_1` | targets=#5735 obj_gen_tun_con_ang_02_door-closed-55 |
| 14103 | `l1_death_opendoor_1-2` | targets=#3867 obj_gen_tun_con_ang_01_door-closed-55 |
| 14120 | `l1_death_opendoor_2` | targets=#9172 obj_gen_tun_con_ang_01_door-closed-55 |
| 14122 | `l1_death_opendoor_2-2` | targets=#9178 obj_gen_tun_con_ang_01_door-closed-55 |
| 14124 | `l1_death_opendoor_3-1` | targets=#14089 obj_gen_tun_con_ang_01_door-closed-55 |
| 15814 | `l1_death_airlockdoor_1` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 15822 | `l1_death_forcollapse` | targets=#13168 obj_gen_n_static_str_01_skyscraper-E |
| 16342 | `l1_death_door_3_airlock` | targets=#16441 obj_f_h_static_str_01_bigdoor |
| 16447 | `l1_death_forcollapse_preload` | targets=#16444 obj_gen_n_static_str_01_skyscraper-E |
| 16460 | `l1_death_gunny_first` | targets=#16459 veh_a_h_c_cha_01_gunnygunny |
| 16464 | `l1_death_gunny_2_car` | targets=#16462 veh_a_h_c_cha_01_gunnygunny |
| 16556 | `l1_death_door_3_closing` | targets=#16554 obj_gen_tun_con_ang_01_door-55 |
| 16563 | `l1_death_toclose_door_2` | targets=#16557 obj_gen_tun_con_ang_01_door-55 |
| 16837 | `city_death_g1_6` | targets=#16749 ed_spawn_point_placeholder, #16750 ed_spawn_point_placeholder, #16751 ed_spawn_point_placeholder, #16752 ed_spawn_point_placeholder… |
| 16902 | `city_death_g2_6` | targets=#16762 ed_spawn_point_placeholder, #16756 ed_spawn_point_placeholder, #16757 ed_spawn_point_placeholder, #16758 ed_spawn_point_placeholder… |
| 16903 | `city_death_g3_6` | targets=#16769 ed_spawn_point_placeholder, #16763 ed_spawn_point_placeholder, #16764 ed_spawn_point_placeholder, #16765 ed_spawn_point_placeholder… |
| 16904 | `city_death_g4_6` | targets=#16776 ed_spawn_point_placeholder, #16775 ed_spawn_point_placeholder, #16774 ed_spawn_point_placeholder, #16773 ed_spawn_point_placeholder… |
| 17348 | `l1_death_stuffslol` | targets=#11864 obj_gen_n_static_str_01_fallen-skyscraper_side, #11863 obj_gen_n_static_str_01_fallen-skyscraper_back, #11865 obj_gen_n_static_str_01_fallen-skyscraper_front |
| 17736 | `l0_death_outsidegate` | — |
| 17902 | `l1_airlock_openairlockdoor` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |

### Delete (32)

| COID | Name | Fields |
|------|------|--------|
| 7989 | `tsp_Ramp_Delete_Lights` | targets=#4259 obj_gen_n_static_str_01_lights-human-sphere, #4258 obj_gen_n_static_str_01_lights-human-sphere, #4254 obj_gen_n_static_str_01_lights-human-sphere, #4255 obj_gen_n_static_str_01_lights-human-sphere… |
| 8037 | `tsp_Ramp_Delete_Lights_2` | — |
| 14133 | `l1_del_gunnysioux1` | targets=#14090 ed_spawn_point_placeholder, #16459 veh_a_h_c_cha_01_gunnygunny, #16499 veh_a_h_o_cha_01_armsman-gunny_inc_husk |
| 16254 | `l1_delete_extracondenser_fx` | targets=#16255 sec_fx_sparks_green, #16244 sec_fx_artillery_2, #16248 sec_fx_blackmist, #16249 sec_fx_smoke01… |
| 16263 | `l1_delete_door_2_fx` | targets=#16258 sec_fx_steam01, #16260 sec_fx_steam01, #16257 sec_fx_steam01, #16270 sec_fx_steam01 |
| 16277 | `l1_delete_door_2_fx_2` | targets=#16271 sec_fx_steam01, #16274 sec_fx_steam01, #16272 sec_fx_steam01, #16273 sec_fx_steam01 |
| 16290 | `l1_del_bridges_fx` | targets=#13266 obj_gen_n_static_str_01_highway-20-long, #13265 obj_gen_n_static_str_01_highway-20-long |
| 16306 | `l1_del_door1_physics` | targets=#16304 invis_physics_10x05rect |
| 16310 | `l1_del_door1_2_physics` | targets=#16309 invis_physics_10x05rect |
| 16340 | `l1_del_door3_airlock_physics` | targets=#16339 invis_physics_10x05rect |
| 16352 | `l1_del_door2_2_physics` | targets=#16351 invis_physics_10x05rect |
| 16393 | `l1_delete_airlock_1_fx_1` | targets=#16391 sec_fx_steam01, #16389 sec_fx_steam01, #16390 sec_fx_steam01 |
| 16403 | `l1_delete_airlock_coll1_steam` | targets=#16395 sec_fx_steam01, #16396 sec_fx_steam01, #16431 sec_fx_Mist |
| 16414 | `l1_delete_airlock_coll2_steam` | targets=#16404 sec_fx_steam01, #16405 sec_fx_steam01 |
| 16416 | `l1_del_airlock_coll3_steam` | targets=#16409 sec_fx_steam01, #16408 sec_fx_steam01 |
| 16429 | `l1_del_door_2_physics` | targets=#16427 invis_physics_10x05rect |
| 16443 | `l1_delete_airlock_forfinal` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 16498 | `l1_del_door3_airlock_entryphysics` | targets=#16458 invis_physics_10x05rect |
| 16562 | `l1_delete_door_2_closing` | targets=#9178 obj_gen_tun_con_ang_01_door-closed-55 |
| 16597 | `l1_del_cave-in_cleanup` | — |
| 17145 | `distance_Tier1_Delete` | — |
| 17147 | `distance_Tier2_Delete` | — |
| 17149 | `distance_Tier3_Delete` | — |
| 17906 | `l1_airlock_delete_openairlockdoor` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 17908 | `l1_airlock_delete_openingdoor` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 17910 | `l1_airlock_delete_closingdoor` | targets=#16441 obj_f_h_static_str_01_bigdoor |
| 17911 | `l1_deletecavernwalls` | targets=#17241 obj_mnt_n_cover_rock_01_plane, #17240 obj_mnt_n_cover_rock_01_plane, #17239 obj_mnt_n_cover_rock_01_plane, #17238 obj_mnt_n_cover_rock_01_plane… |
| 17914 | `l1_delete_t1Door` | targets=#17337 invis_physics_10x05rect, #17324 obj_gen_tun_con_ang_01_door-closed-55 |
| 17915 | `l1_delete_t2Door` | targets=#17325 obj_gen_tun_con_ang_01_door-closed-55, #17336 invis_physics_10x05rect |
| 17927 | `BIGDOOR_l0_delete_staticcloseddoor` | targets=#8915 obj_f_h_static_str_01_bigdoor-c |
| 17929 | `BIGDOOR_l0_delete_openingdoor` | targets=#17925 obj_f_h_static_str_01_bigdoor-o |
| 17931 | `BIGDOOR_l0_delete_closingdoor` | targets=#16441 obj_f_h_static_str_01_bigdoor |

### FailMission (1)

| COID | Name | Fields |
|------|------|--------|
| 17178 | `l1_failmission_exit` | gv1=3052 |

### FirstTimeEvent (1)

| COID | Name | Fields |
|------|------|--------|
| 16497 | `l1_hintrxn_terrainhint` | gv1=17 |

### GiveItemNumCBID (2)

| COID | Name | Fields |
|------|------|--------|
| 16219 | `l0_giveitem_onload_forskip_5` | gv1=7791; gv3=1 |
| 16225 | `L1_giveCBID_frontweapon_5` | gv1=1223; gv3=1 |

### GiveMission (1)

| COID | Name | Fields |
|------|------|--------|
| 14137 | `l1_givemission_start` | gv1=554 |

### MakeInvincible (9)

| COID | Name | Fields |
|------|------|--------|
| 15031 | `l1_setinvul_gen_h` | targets=#4170 obj_gen_h_static_str_01_crane, #3894 obj_gen_h_static_str_01_crane, #9301 obj_gen_h_static_str_01_factory-generator, #9281 obj_gen_h_static_str_01_free-standing-tower… |
| 16629 | `l1_setinvul_gen_h_2` | targets=#3100 obj_f_h_static_str_01_tunnel, #14169 obj_f_b_static_str_01_pipe-support-base-htutorial, #14174 obj_f_b_static_str_01_pipe-support-base-htutorial, #14177 obj_f_b_static_str_01_pipe-support-base-htutorial… |
| 17315 | `l1_setinvul_gen_h_3` | targets=#17455 obj_f_h_static_sign_01_overhead-fabrication, #17456 obj_f_h_static_sign_01_overhead-general, #5654 obj_f_h_static_sign_01_xroad-post, #5653 obj_f_h_static_sign_01_xroad-post… |
| 17316 | `l1_setinvul_gen_h_4` | targets=#15775 obj_gen_n_static_str_04_girders, #15774 obj_gen_n_static_str_04_girders, #15769 obj_gen_n_static_str_04_girders, #15766 obj_gen_n_static_str_04_girders… |
| 17389 | `l1_invul_another` | targets=#17382 obj_gen_h_static_str_01_wall-segment-half-tall, #4758 obj_f_h_static_str_01_building-pieces-wall-plain, #4757 obj_f_h_static_str_01_building-pieces-wall-plain, #17384 obj_f_h_static_str_01_building-pieces-wall-plain… |
| 17395 | `l1_setinvul_gen_h_5` | targets=#15595 obj_gen_n_static_str_06_hestia-propaganda, #9306 obj_f_h_static_str_01_tunnel, #15594 obj_gen_n_static_str_05_hestia-propaganda, #15593 obj_gen_n_static_str_02_hestia-propaganda… |
| 17410 | `l1_setinvul_gen_h_6` | targets=#17360 obj_f_h_static_str_01_housing, #9268 obj_f_h_static_str_01_housing, #9267 obj_f_h_static_str_01_housing, #9228 obj_f_h_static_str_01_housing… |
| 17735 | `l0_invul_outsidebase` | targets=#17626 obj_f_h_static_str_01_tunnel, #17627 obj_f_h_static_str_01_tunnel, #17628 obj_f_h_static_str_01_tunnel, #17672 obj_f_h_static_str_01_tunnel |
| 17870 | `SET_INVUL_humanassets_more` | targets=#17619 obj_f_h_static_str_01_barracks, #17618 obj_f_h_static_str_01_barracks, #17617 obj_f_h_static_str_01_barracks, #17616 obj_f_h_static_str_01_barracks… |

### MakeNotInvincbile (1)

| COID | Name | Fields |
|------|------|--------|
| 16350 | `l1_makevulnerable_condenser` | targets=#9301 obj_gen_h_static_str_01_factory-generator |

### MarkRepairStation (2)

| COID | Name | Fields |
|------|------|--------|
| 16553 | `l1_bindrepair_player` | gv1=tsp_Boost_01 (1) |
| 17918 | `l1_markrepair_entry` | gv1=L0_const_0 (3) |

### RelockContObj (1)

| COID | Name | Fields |
|------|------|--------|
| 17871 | `l0_relock_backrange` | gv1=693 |

### RemoveFromInv (1)

| COID | Name | Fields |
|------|------|--------|
| 17936 | `l0_takeitem_pamphlet` | gv1=7791; gv3=1 |

### SetActiveObjective (1)

| COID | Name | Fields |
|------|------|--------|
| 17935 | `L0_setact_startobjective` | gv1=714 |

### SetFactionFromVar (1)

| COID | Name | Fields |
|------|------|--------|
| 17919 | `l1_setfaction_generator_human` | gv1=l0_faction_default (217); targets=#9301 obj_gen_h_static_str_01_factory-generator |

### SetPath (12)

| COID | Name | Fields |
|------|------|--------|
| 16914 | `city_pathchange_1A_6` | gv1=16540 |
| 16915 | `city_pathchange_1B_6` | gv1=16539 |
| 16916 | `city_pathchange_2A_6` | gv1=16541 |
| 16917 | `city_pathchange_2B_6` | gv1=16542 |
| 16918 | `city_pathchange_3A_6` | gv1=16543 |
| 16919 | `city_pathchange_4B_6` | gv1=16546 |
| 16920 | `city_pathchange_5A_6` | gv1=16547 |
| 16921 | `city_pathchange_5B_6` | gv1=16548 |
| 16922 | `city_pathchange_6A_6` | gv1=16549 |
| 16923 | `city_pathchange_6B_6` | gv1=16550 |
| 16924 | `city_pathchange_7A_6` | gv1=16551 |
| 16925 | `city_pathchange_7B_6` | gv1=16552 |

### SkillCast (3)

| COID | Name | Fields |
|------|------|--------|
| 16446 | `l1_skillcast_heal` | gv1=857; gv3=1 |
| 16481 | `l1_skillcast_pain` | gv1=2567; gv3=1 |
| 16587 | `l1_skillcast_camerashake` | — |

### Teleport (1)

| COID | Name | Fields |
|------|------|--------|
| 16906 | `city_teleport_vehicle_6` | gv1=16905; gv2=1 |

### Text (6)

| COID | Name | Fields |
|------|------|--------|
| 15837 | `l1_text_transitwarning` | text="Next Exit : The Back Range" |
| 16220 | `L1_text_start_withitem_5` | text="The Ark Bay is a tutorial area you can use to gain a better understanding of …"; choices="Continue"→T-1, "Bypass Map"→T16221 |
| 16228 | `L1_text_nagline_5` | text="Left click on Lieutenant Rogers in the glowing pillar of light to continue!" |
| 16233 | `L1_text_nagline_2_arrow_5` | text="Watch the Screentop Arrow for your next mission destination." |
| 16287 | `L1_text_ambushwarning` | text="Look out! A Scav ambush!" |
| 16593 | `l1_text_acavein` | text="A Cave In! Find a detour!" |

### TransferMap (2)

| COID | Name | Fields |
|------|------|--------|
| 15838 | `l1_maptransfer_tobackrange` | transfer=ContinentObject:693 |
| 16222 | `L0_transfermap_backrange` | transfer=ContinentObject:693 |

### UnlockContObj (2)

| COID | Name | Fields |
|------|------|--------|
| 16218 | `L1_unlock_backrange` | gv1=693 |
| 17913 | `l0_unlock_arkbay` | gv1=707 |

### VariableSet (23)

| COID | Name | Fields |
|------|------|--------|
| 14099 | `L1_setvar_door1` | gv1=l1_door1_hasopened (5); gv3=4 |
| 14121 | `L1_setvar_door2` | gv1=l1_door2_hasopened (6); gv3=4 |
| 14125 | `L1_setvar_door3` | gv1=l1_door3_hasopened (7); gv3=4 |
| 14135 | `L1_setvar_gunnyhasdeleted_1` | gv1=L1_gunnysioux1_hasdeleted (11); gv3=4 |
| 14140 | `L1_setvar_gunny1_1` | gv1=L1_hascreated_gunny1 (13); gv3=4 |
| 16241 | `L1_setvar_gunny2_created` | gv1=L1_hascreated_gunny2 (52); gv3=4 |
| 16250 | `l1_setvar_condenser_used_fx` | gv1=L1_hasused_condenser (55); gv3=4 |
| 16380 | `l1_setvar_airlock_1_open_to1` | gv1=l1_airlockdoor_1_open (58); gv3=4 |
| 16397 | `l1_setvar_airlock_collide1_to1` | gv1=l1_airlockdoor_collidefx_1 (59); gv3=4 |
| 16398 | `l1_setvar_airlock_collide2_to1` | gv1=l1_airlockdoor_collidefx_2 (60); gv3=4 |
| 16399 | `l1_setvar_airlock_collide3_to1` | gv1=l1_airlockdoor_collidefx_3 (61); gv3=4 |
| 16442 | `l1_setvar_airlock_final_toclosed` | gv1=L1_airlock_closed (62); gv3=4 |
| 16469 | `L1_setvar_gunny2_heals` | gv1=l1_gunnyheal_lock (63); gv3=4 |
| 16478 | `L1_setvar_hascast_painskill` | gv1=l1_hascast_painskill (65); gv3=4 |
| 16595 | `L1_setvar_cavedin_1` | gv1=l1_var_cavedin (68); gv3=4 |
| 16617 | `l1_setvar_buildinghasblown` | gv1=l1_var_buildinghasblown (69); gv3=4 |
| 17171 | `distance_Tier_Set1` | gv1=Tier (206); gv3=207 |
| 17172 | `distance_Tier_Set2` | gv1=Tier (206); gv3=208 |
| 17173 | `distance_Tier_Set3` | gv1=Tier (206); gv3=209 |
| 17174 | `distance_Tier_Set4` | gv1=Tier (206); gv3=210 |
| 17175 | `distance_Tier_Set5` | gv1=Tier (206); gv3=211 |
| 17176 | `distance_Tier_Set6` | gv1=Tier (206); gv3=212 |
| 17932 | `BIGDOOR_setvar_bigdooropened` | gv1=l0_bigdoorvar_opening (218); gv3=4 |

### VariableSetRandom (21)

| COID | Name | Fields |
|------|------|--------|
| 16777 | `city_Gamble_G1_6` | gv1=city_G1_6 (166) |
| 16778 | `city_Gamble_G2_6` | gv1=city_G2_6 (173) |
| 16779 | `city_Gamble_G3_6` | gv1=city_G3_6 (174) |
| 16780 | `city_Gamble_G4_6` | gv1=city_G4_6 (175) |
| 17026 | `city_Gamble_J1_6` | gv1=city_J1_6 (181) |
| 17027 | `city_Gamble_J2_6` | gv1=city_J2_6 (182) |
| 17028 | `city_Gamble_J3_6` | gv1=city_J3_6 (183) |
| 17029 | `city_Gamble_J4_6` | gv1=city_J4_6 (184) |
| 17030 | `city_Gamble_J5_6` | gv1=city_J5_6 (185) |
| 17031 | `city_Gamble_J6_6` | gv1=city_J6_6 (186) |
| 17032 | `city_Gamble_J7_6` | gv1=city_J7_6 (187) |
| 17033 | `city_Gamble_J8_6` | gv1=city_J8_6 (188) |
| 17034 | `city_Gamble_J9_6` | gv1=city_J9_6 (189) |
| 17035 | `city_Gamble_J10_6` | gv1=city_J10_6 (190) |
| 17036 | `city_Gamble_J11_6` | gv1=city_J11_6 (191) |
| 17037 | `city_Gamble_J12_6` | gv1=city_J12_6 (192) |
| 17038 | `city_Gamble_J13_6` | gv1=city_J13_6 (193) |
| 17039 | `city_Gamble_J14_6` | gv1=city_J14_6 (194) |
| 17040 | `city_Gamble_J15_6` | gv1=city_J15_6 (195) |
| 17041 | `city_Gamble_J16_6` | gv1=city_J16_6 (196) |
| 17042 | `city_Gamble_J17_6` | gv1=city_J17_6 (197) |

<!-- /AUTO:reactions -->
