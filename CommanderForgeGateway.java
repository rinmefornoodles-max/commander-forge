# Commander Forge authoritative rules-engine protocol

The browser UI must not encode card-specific rules once authoritative mode is enabled. It renders state, presents choices, and sends player intentions. The gateway/rules engine decides legality and results.

## Required endpoints for authoritative mode

### `GET /api/v1/health`
Returns engine/gateway status.

### `POST /api/v1/games`
Creates a game from Commander decklists and options.

Request:
```json
{
  "format": "commander",
  "players": [
    {"clientPlayerId":"p1","name":"Player 1","deck":[{"name":"Sol Ring","count":1}]},
    {"clientPlayerId":"p2","name":"Player 2","deck":[{"name":"Sol Ring","count":1}]}
  ],
  "testMode": false
}
```

Response returns `gameId`, mapped player IDs, the viewer-safe state, legal actions, and any pending choice.

### `GET /api/v1/games/{gameId}?viewer={playerId}`
Returns the state filtered for that viewer. Never reveal hidden opponent information to another client.

### `GET /api/v1/games/{gameId}/actions?player={playerId}`
Returns only actions that are currently legal for that player.

### `POST /api/v1/games/{gameId}/actions`
Sends one player intention. Every action has a stable ID supplied by the engine; the client should not invent legal actions.

```json
{
  "playerId": "engine-player-id",
  "actionId": "engine-action-id",
  "choice": {
    "targets": ["engine-object-id"],
    "amount": 3,
    "option": "top"
  },
  "expectedRevision": 41
}
```

The engine validates the revision and action, advances rules/state-based actions/triggers as appropriate, then returns the new viewer-safe state.

### `POST /api/v1/games/{gameId}/pass`
Pass priority.

### `POST /api/v1/games/{gameId}/undo/request`
Requests an undo. The engine is authoritative about what snapshot can be restored.

### `POST /api/v1/games/{gameId}/undo/respond`
Other player approves or denies.

## Choice model

A rules engine often cannot advance until a player answers a choice. The gateway translates XMage callbacks such as target, ability, pile, generic choice, ask, select, mana, X-mana and amount dialogs into one browser model:

```json
{
  "choiceId":"choice-123",
  "kind":"targets",
  "prompt":"Choose target creature card in your graveyard",
  "min":1,
  "max":1,
  "options":[
    {"id":"obj-1","label":"Baleful Strix","cardId":"scryfall-or-engine-id"}
  ]
}
```

The browser only displays the choices the engine supplies.

## State revisions

Every authoritative response carries a monotonically increasing `revision`. The browser sends `expectedRevision` with actions. Stale requests are rejected and the latest state is returned. This prevents two clients from producing conflicting states.

## Test override

Test mode must remain separate from normal legality. Test-only commands are explicit (`test.setZone`, `test.setLife`, `test.addMana`, etc.) and are disabled unless the game was created with `testMode: true`. After constructing a test state, normal rules processing resumes from the resulting engine state.
