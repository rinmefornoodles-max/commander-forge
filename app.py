from __future__ import annotations

import copy
import random
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import requests
import streamlit as st

SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection"
MTGJSON_DECK_LIST = "https://mtgjson.com/api/v5/DeckList.json"
MTGJSON_DECK_BASE = "https://mtgjson.com/api/v5/decks"
HEADERS = {
    "User-Agent": "MTG-Commander-Practice-Table/1.0 (personal learning project)",
    "Accept": "application/json",
}
PHASES = [
    "Untap", "Upkeep", "Draw", "Precombat Main", "Beginning of Combat",
    "Declare Attackers", "Declare Blockers", "Combat Damage", "End of Combat",
    "Postcombat Main", "End Step", "Cleanup",
]
ZONES = ["hand", "battlefield", "graveyard", "exile", "command"]


@dataclass
class Card:
    name: str
    uid: str = field(default_factory=lambda: uuid.uuid4().hex)
    mana_value: float = 0
    mana_cost: str = ""
    type_line: str = ""
    oracle_text: str = ""
    power: Optional[str] = None
    toughness: Optional[str] = None
    image_url: Optional[str] = None
    scryfall_uri: Optional[str] = None
    tapped: bool = False
    face_down: bool = False
    counters: dict[str, int] = field(default_factory=dict)
    notes: str = ""

    @property
    def is_land(self) -> bool:
        return "Land" in self.type_line

    @property
    def is_creature(self) -> bool:
        return "Creature" in self.type_line

    @property
    def display_name(self) -> str:
        return "Face-down card" if self.face_down else self.name


@dataclass
class PlayerState:
    name: str
    life: int = 40
    library: list[Card] = field(default_factory=list)
    hand: list[Card] = field(default_factory=list)
    battlefield: list[Card] = field(default_factory=list)
    graveyard: list[Card] = field(default_factory=list)
    exile: list[Card] = field(default_factory=list)
    command: list[Card] = field(default_factory=list)
    commander_casts: dict[str, int] = field(default_factory=dict)
    lands_played_this_turn: int = 0
    mana_pool: dict[str, int] = field(default_factory=lambda: {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0})

    def zone(self, name: str) -> list[Card]:
        return getattr(self, name)

    def draw(self, amount: int = 1) -> int:
        drawn = 0
        for _ in range(max(0, amount)):
            if not self.library:
                break
            self.hand.append(self.library.pop())
            drawn += 1
        return drawn

    def untap_all(self) -> None:
        for card in self.battlefield:
            card.tapped = False
        self.lands_played_this_turn = 0
        for color in self.mana_pool:
            self.mana_pool[color] = 0


@dataclass
class GameState:
    players: list[PlayerState]
    active_player: int = 0
    turn_number: int = 1
    phase_index: int = 0
    starting_player: int = 0
    commander_damage: dict[str, int] = field(default_factory=dict)
    log: list[str] = field(default_factory=list)

    @property
    def active(self) -> PlayerState:
        return self.players[self.active_player]

    @property
    def phase(self) -> str:
        return PHASES[self.phase_index]

    def add_log(self, text: str) -> None:
        self.log.append(text)
        self.log = self.log[-250:]


def parse_decklist(text: str) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.lower().startswith(("deck", "sideboard", "maybeboard")):
            continue
        if line.lower().rstrip(":") in {"commander", "commanders", "mainboard", "main deck"}:
            continue
        line = re.sub(r"\s+\([A-Z0-9]+\)\s+\d+[a-z]?\s*$", "", line)
        line = re.sub(r"\s+\[[^\]]+\]\s*$", "", line)
        match = re.match(r"^(\d+)\s*[xX]?\s+(.+)$", line)
        qty, name = (int(match.group(1)), match.group(2).strip()) if match else (1, line)
        if name:
            result.append((qty, name))
    return result


def card_image(data: dict[str, Any]) -> Optional[str]:
    if data.get("image_uris"):
        return data["image_uris"].get("normal") or data["image_uris"].get("large")
    for face in data.get("card_faces") or []:
        if face.get("image_uris"):
            return face["image_uris"].get("normal") or face["image_uris"].get("large")
    return None


@st.cache_data(show_spinner=False, ttl=86400)
def fetch_cards(names: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    unique = list(dict.fromkeys(name.strip() for name in names if name.strip()))
    for start in range(0, len(unique), 75):
        batch = unique[start:start + 75]
        response = requests.post(
            SCRYFALL_COLLECTION,
            headers=HEADERS,
            json={"identifiers": [{"name": name} for name in batch]},
            timeout=35,
        )
        response.raise_for_status()
        payload = response.json()
        for item in payload.get("data", []):
            found[item["name"].casefold()] = item
        time.sleep(0.12)
    return found


def create_card(data: dict[str, Any], fallback_name: str) -> Card:
    oracle = data.get("oracle_text", "")
    if not oracle:
        oracle = "\n\n".join(face.get("oracle_text", "") for face in data.get("card_faces", []) if face.get("oracle_text"))
    return Card(
        name=data.get("name", fallback_name),
        mana_value=float(data.get("cmc", 0) or 0),
        mana_cost=data.get("mana_cost", ""),
        type_line=data.get("type_line", ""),
        oracle_text=oracle,
        power=data.get("power"),
        toughness=data.get("toughness"),
        image_url=card_image(data),
        scryfall_uri=data.get("scryfall_uri"),
    )


def build_cards(entries: list[tuple[int, str]]) -> tuple[list[Card], list[str]]:
    fetched = fetch_cards(tuple(name for _, name in entries))
    cards: list[Card] = []
    missing: list[str] = []
    for quantity, requested in entries:
        data = fetched.get(requested.casefold())
        if not data:
            data = next((value for key, value in fetched.items() if key.startswith(requested.casefold() + " //")), None)
        if not data:
            missing.append(requested)
            continue
        cards.extend(create_card(data, requested) for _ in range(quantity))
    return cards, missing


@st.cache_data(show_spinner=False, ttl=21600)
def fetch_precon_index() -> list[dict[str, Any]]:
    response = requests.get(MTGJSON_DECK_LIST, headers=HEADERS, timeout=40)
    response.raise_for_status()
    payload = response.json()
    decks = payload.get("data", [])
    # Commander products vary in their exact type labels. Keep likely Commander decks,
    # but fall back to all products if MTGJSON changes the labels.
    commander = [d for d in decks if "commander" in str(d.get("type", "")).casefold()]
    return commander or decks


@st.cache_data(show_spinner=False, ttl=21600)
def fetch_precon(file_name: str) -> dict[str, Any]:
    # MTGJSON deck files have changed locations over time. Try several
    # supported formats instead of assuming one URL structure.
    candidates = []

    cleaned = str(file_name).strip()
    if cleaned:
        candidates.append(cleaned)
        candidates.append(cleaned.rsplit("/", 1)[-1])

    last_error = None

    for candidate in dict.fromkeys(candidates):
        urls = [
            f"{MTGJSON_DECK_BASE}/{candidate}",
            f"https://mtgjson.com/api/v5/decks/{candidate}.json",
        ]

        for url in urls:
            try:
                response = requests.get(url, headers=HEADERS, timeout=45)
                if response.ok:
                    payload = response.json()
                    return payload.get("data", payload)
                last_error = response.text
            except Exception as exc:
                last_error = exc

    raise RuntimeError(
        "Could not find this precon in MTGJSON. "
        "Try Paste a decklist or use a different precon."
    )


def mtgjson_card_name(item: dict[str, Any]) -> str:
    return str(item.get("name") or item.get("faceName") or "").strip()


def precon_to_entries(deck: dict[str, Any]) -> tuple[list[tuple[int, str]], list[str]]:
    commander_names: list[str] = []
    entries: list[tuple[int, str]] = []
    for item in deck.get("commander", []) or []:
        name = mtgjson_card_name(item)
        if name:
            commander_names.append(name)
    for item in deck.get("mainBoard", []) or []:
        name = mtgjson_card_name(item)
        if name:
            entries.append((int(item.get("count", 1) or 1), name))
    return entries, commander_names


def make_player(name: str, entries: list[tuple[int, str]], commander_names: list[str]) -> tuple[PlayerState, list[str]]:
    # Some exports list commanders separately instead of including them in the main deck.
    expanded_entries = list(entries)
    listed_names = {card_name.casefold() for _, card_name in expanded_entries}
    for commander_name in commander_names:
        if commander_name.casefold() not in listed_names:
            expanded_entries.append((1, commander_name))
    cards, missing = build_cards(expanded_entries)
    commanders: list[Card] = []
    for commander_name in commander_names:
        match = next((card for card in cards if card.name.casefold() == commander_name.casefold()), None)
        if match:
            cards.remove(match)
            commanders.append(match)
    random.shuffle(cards)
    player = PlayerState(name=name, library=cards, command=commanders)
    player.draw(7)
    return player, missing


def start_game(configs: list[tuple[str, list[tuple[int, str]], list[str]]], starting_player: int) -> GameState:
    players: list[PlayerState] = []
    all_missing: list[tuple[str, list[str]]] = []
    for player_name, entries, commanders in configs:
        player, missing = make_player(player_name, entries, commanders)
        if len(player.library) + len(player.command) < 20:
            raise ValueError(f"{player_name}'s deck has fewer than 20 recognized cards.")
        players.append(player)
        all_missing.append((player_name, missing))
    game = GameState(players=players, active_player=starting_player, starting_player=starting_player)
    game.active.untap_all()
    game.add_log("Game started. Each player drew seven cards.")
    game.add_log(f"{game.active.name} goes first. The first player's first draw is left manual so you can choose your preferred 1v1 rule.")
    for player_name, missing in all_missing:
        if missing:
            game.add_log(f"Unrecognized for {player_name}: {', '.join(missing)}")
    return game


def snapshot() -> None:
    if st.session_state.game is None:
        return
    st.session_state.undo_stack.append(copy.deepcopy(st.session_state.game))
    st.session_state.undo_stack = st.session_state.undo_stack[-30:]


def locate_card(game: GameState, uid: str) -> tuple[int, str, int, Card] | None:
    for player_index, player in enumerate(game.players):
        for zone_name in ["library", "hand", "battlefield", "graveyard", "exile", "command"]:
            for card_index, card in enumerate(player.zone(zone_name)):
                if card.uid == uid:
                    return player_index, zone_name, card_index, card
    return None


def move_card(game: GameState, uid: str, destination_player: int, destination_zone: str, *, top: bool = True) -> bool:
    located = locate_card(game, uid)
    if not located:
        return False
    source_player_index, source_zone, source_index, card = located
    source = game.players[source_player_index].zone(source_zone)
    source.pop(source_index)
    destination = game.players[destination_player].zone(destination_zone)
    card.tapped = False if destination_zone != "battlefield" else card.tapped
    if destination_zone == "library" and not top:
        destination.insert(0, card)
    else:
        destination.append(card)
    game.add_log(f"Moved {card.name} from {game.players[source_player_index].name}'s {source_zone} to {game.players[destination_player].name}'s {destination_zone}.")
    return True


def advance_phase(game: GameState) -> None:
    game.phase_index += 1
    if game.phase_index >= len(PHASES):
        game.phase_index = 0
        game.active_player = (game.active_player + 1) % len(game.players)
        if game.active_player == game.starting_player:
            game.turn_number += 1
        game.active.untap_all()
        game.add_log(f"Turn {game.turn_number}: {game.active.name}'s turn begins. Permanents untap and mana pools clear.")
    else:
        game.add_log(f"{game.active.name}: {game.phase}.")
    if game.phase == "Draw":
        drawn = game.active.draw(1)
        game.add_log(f"{game.active.name} draws {drawn} card." if drawn else f"{game.active.name} cannot draw because their library is empty.")


def card_label(card: Card) -> str:
    status = []
    if card.tapped:
        status.append("tapped")
    if card.counters:
        status.append(", ".join(f"{amount} {kind}" for kind, amount in card.counters.items() if amount))
    suffix = f" — {'; '.join(status)}" if status else ""
    return f"{card.display_name}{suffix} [{card.uid[:5]}]"


def render_card(card: Card, compact: bool = False) -> None:
    if card.face_down:
        st.markdown("### 🂠 Face-down card")
        st.caption(card.notes or "Identity hidden")
        return
    if card.image_url:
        st.image(card.image_url, use_container_width=True)
    else:
        st.markdown(f"### {card.name}")
    if not compact:
        stats = f" • {card.power}/{card.toughness}" if card.is_creature else ""
        st.caption(f"{card.mana_cost or 'No mana cost'} • {card.type_line}{stats}")
        with st.expander("Oracle text"):
            st.write(card.oracle_text or "No Oracle text.")
            if card.notes:
                st.info(card.notes)



def render_zone_cards(player: PlayerState, zone_name: str, reveal: bool = True) -> None:
    cards = player.zone(zone_name)
    if not cards:
        st.info(f"No cards in {zone_name}.")
        return
    columns = st.columns(min(4, len(cards)))
    for index, card in enumerate(cards):
        with columns[index % len(columns)]:
            if reveal:
                render_card(card, compact=True)
                if st.button("🃏 Open card menu", key=f"select_{zone_name}_{card.uid}", use_container_width=True):
                    st.session_state.selected_card = {
                        "uid": card.uid,
                        "player": game.players.index(player),
                        "zone": zone_name,
                    }
                    st.rerun()
            else:
                st.markdown("### 🂠")
                st.caption("Hidden card")
            st.caption(card_label(card) if reveal else f"Card {index + 1}")


def render_deck_preview(deck_name: str, commander_names: list[str], entries: list[tuple[int, str]]) -> None:
    commander = commander_names[0] if commander_names else None
    image_url = None
    if commander:
        try:
            data = fetch_cards((commander,)).get(commander.casefold())
            if data:
                image_url = card_image(data)
        except Exception:
            image_url = None
    left, right = st.columns([1, 2.2])
    with left:
        if image_url:
            st.image(image_url, use_container_width=True)
        else:
            st.markdown('<div class="deck-placeholder">🃏</div>', unsafe_allow_html=True)
    with right:
        st.markdown(f"<div class='deck-preview-title'>{deck_name}</div>", unsafe_allow_html=True)
        st.caption(f"Commander: {', '.join(commander_names) or 'Not identified'}")
        st.caption(f"{sum(q for q, _ in entries)} cards loaded from the deck source")


def setup_deck_ui(slot: int) -> tuple[str, list[tuple[int, str]], list[str]] | None:
    st.markdown(f"#### Player {slot + 1}")
    player_name = st.text_input("Player name", value=f"Player {slot + 1}", key=f"name_{slot}")
    source = st.radio("Deck source", ["Search official precons", "Paste a decklist"], horizontal=True, key=f"source_{slot}")
    if source == "Paste a decklist":
        commander_text = st.text_input("Commander name(s), separated by commas", key=f"commanders_{slot}")
        deck_text = st.text_area("Decklist", height=230, key=f"deck_{slot}", placeholder="1 Sol Ring\n1 Command Tower\n...")
        entries = parse_decklist(deck_text)
        commanders = [name.strip() for name in commander_text.split(",") if name.strip()]
        return player_name, entries, commanders

    try:
        index = fetch_precon_index()
    except Exception as exc:
        st.warning(f"Precon search is unavailable right now: {exc}")
        st.caption("You can switch to Paste a decklist and still use the practice table.")
        return None
    query = st.text_input("Search precons", key=f"precon_search_{slot}", placeholder="Grave Danger")
    candidates = index
    if query.strip():
        q = query.casefold().strip()
        candidates = [d for d in index if q in str(d.get("name", "")).casefold()]
    candidates = sorted(candidates, key=lambda d: str(d.get("releaseDate", "")), reverse=True)[:100]
    if not candidates:
        st.info("No matching precons.")
        return None
    labels = [f"{d.get('name', 'Unknown')} ({d.get('releaseDate', '?')})" for d in candidates]
    selected_label = st.selectbox("Choose a precon", labels, key=f"precon_choice_{slot}")
    selected = candidates[labels.index(selected_label)]
    try:
        deck = fetch_precon(str(selected.get("fileName", "")))
        entries, commanders = precon_to_entries(deck)
    except Exception as exc:
        st.error(f"Could not load that precon: {exc}")
        return None
    render_deck_preview(str(selected.get("name", "Selected precon")), commanders, entries)
    return player_name, entries, commanders


st.set_page_config(page_title="The Commander Forge", page_icon="⚔️", layout="wide", initial_sidebar_state="collapsed")

st.markdown(
    """
    <style>
    :root {
        --bg: #0a0f14; --panel: #111922; --panel2: #16212c; --line: #263543;
        --text: #edf3f7; --muted: #9eacb8; --accent: #d7a84f; --accent2: #76b5c5;
    }
    .stApp {background: radial-gradient(circle at top right, rgba(118,181,197,.09), transparent 28%), var(--bg);}
    .block-container {max-width: 1450px; padding-top: 1.1rem; padding-bottom: 5.5rem;}
    #MainMenu, footer, header {visibility: hidden;}
    h1,h2,h3,h4 {letter-spacing: -.02em;}
    [data-testid="stSidebar"] {background: #0d141c; border-right: 1px solid var(--line);}
    [data-testid="stMetric"] {background: linear-gradient(180deg, #15202a, #101820); border: 1px solid var(--line); border-radius: 16px; padding: .75rem .9rem;}
    [data-testid="stMetricValue"] {font-size: 1.55rem; color: var(--text);}
    [data-testid="stMetricLabel"] {color: var(--muted);}
    .stButton > button {min-height: 2.8rem; border-radius: 12px; border: 1px solid #334655; font-weight: 700; transition: .15s ease;}
    .stButton > button:hover {transform: translateY(-1px); border-color: var(--accent);}
    .stButton > button[kind="primary"] {background: linear-gradient(135deg, #c58f34, #e1bd6f); color: #16120b; border: 0;}
    div[data-baseweb="tab-list"] {gap: .35rem; background: rgba(13,20,28,.92); border: 1px solid var(--line); border-radius: 16px; padding: .38rem; overflow-x: auto;}
    button[data-baseweb="tab"] {border-radius: 11px; white-space: nowrap; padding-left: 1rem; padding-right: 1rem;}
    button[data-baseweb="tab"][aria-selected="true"] {background: #22313d;}
    [data-testid="stExpander"] {border: 1px solid var(--line); border-radius: 14px; overflow: hidden;}
    [data-testid="stImage"] img {border-radius: 16px; box-shadow: 0 10px 28px rgba(0,0,0,.32);}
    .hero {background: linear-gradient(135deg, rgba(30,48,61,.97), rgba(16,24,32,.97)); border: 1px solid #304454; border-radius: 24px; padding: 1.25rem 1.4rem; margin-bottom: 1rem; box-shadow: 0 18px 55px rgba(0,0,0,.22);}
    .hero-kicker {color: var(--accent); text-transform: uppercase; letter-spacing: .13em; font-size: .72rem; font-weight: 800;}
    .hero-title {font-size: clamp(1.65rem, 4vw, 2.7rem); font-weight: 850; line-height: 1.05; color: var(--text); margin: .25rem 0 .45rem;}
    .hero-copy {color: #b8c4cc; max-width: 760px; font-size: .98rem;}
    .section-card {background: linear-gradient(180deg, rgba(20,31,41,.98), rgba(14,22,30,.98)); border: 1px solid var(--line); border-radius: 20px; padding: 1rem; margin-bottom: .8rem;}
    .deck-preview-title {font-size: 1.08rem; font-weight: 800; color: var(--text); margin-top: .3rem;}
    .deck-placeholder {height: 150px; display:flex; align-items:center; justify-content:center; border-radius:16px; background:#17222c; border:1px dashed #405666; font-size:2rem;}
    .status-strip {position: sticky; top: .4rem; z-index: 999; backdrop-filter: blur(12px); background: rgba(10,15,20,.9); border: 1px solid var(--line); border-radius: 18px; padding: .65rem .75rem; margin-bottom: .8rem; box-shadow: 0 10px 28px rgba(0,0,0,.25);}
    .player-banner {background: linear-gradient(135deg, #16222c, #111920); border: 1px solid var(--line); border-radius: 18px; padding: .75rem 1rem; margin-bottom: .6rem;}
    .player-name {font-size: 1.22rem; font-weight: 850;}
    .active-chip {display:inline-block; margin-left:.45rem; padding:.16rem .48rem; border-radius:999px; background:#d7a84f; color:#17120a; font-size:.67rem; font-weight:900; vertical-align:middle;}
    .playmat {background: radial-gradient(circle at center, rgba(45,70,63,.22), transparent 55%), linear-gradient(180deg,#111b1c,#0e1618); border:1px solid #293d3d; border-radius:22px; padding:1rem; margin-bottom:1rem;}
    .zone-label {font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; color:#9fb2b3; font-weight:800; margin-bottom:.4rem;}
    @media (max-width: 700px) {
        .block-container {padding-left: .58rem; padding-right: .58rem; padding-top: .55rem;}
        .hero {padding: 1rem; border-radius: 18px;}
        .hero-title {font-size: 1.7rem;}
        [data-testid="column"] {min-width: 0 !important;}
        [data-testid="stImage"] img {max-height: 420px; object-fit: contain;}
        div[data-baseweb="tab-list"] {position: sticky; bottom: .35rem; z-index: 998; box-shadow: 0 10px 30px rgba(0,0,0,.4);}
        button[data-baseweb="tab"] {font-size:.78rem; padding-left:.7rem; padding-right:.7rem;}
        .status-strip {top:.2rem; padding:.5rem;}
    }
    </style>
    <div class="hero">
      <div class="hero-kicker">Commander learning workspace</div>
      <div class="hero-title">⚔️ The Commander Forge</div>
      <div class="hero-copy">Build, test, and master any Commander deck. Play manually while the table handles setup, zones, life, phases, commander tracking, and undo.</div>
    </div>
    """,
    unsafe_allow_html=True,
)

if "game" not in st.session_state:
    st.session_state.game = None
if "undo_stack" not in st.session_state:
    st.session_state.undo_stack = []

if st.session_state.game is None:
    st.caption("You control both decks. Keep both hands visible while learning, or hide one physically and reveal it only when needed.")
    left, right = st.columns(2, gap="large")
    with left:
        first = setup_deck_ui(0)
    with right:
        second = setup_deck_ui(1)
    starting = st.radio("Starting player", ["Player 1", "Player 2", "Random"], horizontal=True)
    if st.button("Start practice game", type="primary", use_container_width=True):
        if not first or not second or not first[1] or not second[1]:
            st.error("Both players need a loaded decklist.")
        else:
            start_index = random.randrange(2) if starting == "Random" else (0 if starting == "Player 1" else 1)
            try:
                with st.spinner("Loading card data and images from Scryfall..."):
                    st.session_state.game = start_game([first, second], start_index)
                    st.session_state.undo_stack = []
                st.rerun()
            except Exception as exc:
                st.error(str(exc))
    st.markdown("""
### 🃏 Practice Mode
A digital Commander table that handles setup and tracking while you play the game yourself.

Card effects, targets, triggers, and unusual rules interactions are resolved manually, just like playing with physical cards.
""")
    st.stop()


game: GameState = st.session_state.game

# Quick card interaction panel
if "selected_card" not in st.session_state:
    st.session_state.selected_card = None

if st.session_state.selected_card:
    selected = locate_card(game, st.session_state.selected_card["uid"])
    if selected:
        owner_index, current_zone, _, selected_card = selected
        st.markdown("### 🃏 Card Menu")
        st.markdown(f"**{selected_card.name}**  \\n*{current_zone}*")
        action_cols = st.columns(4)
        if action_cols[0].button("Tap / Untap", use_container_width=True):
            snapshot(); selected_card.tapped = not selected_card.tapped; st.rerun()
        if action_cols[1].button("Battlefield", use_container_width=True):
            snapshot(); move_card(game, selected_card.uid, owner_index, "battlefield"); st.session_state.selected_card=None; st.rerun()
        if action_cols[2].button("Graveyard", use_container_width=True):
            snapshot(); move_card(game, selected_card.uid, owner_index, "graveyard"); st.session_state.selected_card=None; st.rerun()
        if action_cols[3].button("View Text", use_container_width=True):
            st.info(selected_card.oracle_text or "No Oracle text.")
        move_cols = st.columns(4)
        destinations = [("Hand","hand"),("Exile","exile"),("Command","command"),("Copy","copy")]
        for col,(label,dest) in zip(move_cols,destinations):
            if col.button(label, use_container_width=True):
                snapshot()
                if dest == "copy":
                    token=copy.deepcopy(selected_card); token.uid=uuid.uuid4().hex; token.notes="Copy token"
                    game.players[owner_index].battlefield.append(token)
                    game.add_log(f"Created a copy of {selected_card.name}.")
                else:
                    move_card(game, selected_card.uid, owner_index, dest)
                st.session_state.selected_card=None
                st.rerun()

st.markdown('<div class="status-strip">', unsafe_allow_html=True)
status_a, status_b, status_c, status_d, status_e = st.columns([1.15, 1.35, 1.35, 1, 1])
status_a.markdown(f"**Turn {game.turn_number}**")
status_b.markdown(f"**{game.active.name}**")
status_c.markdown(f"**{game.phase}**")
if status_d.button("Next phase", type="primary", use_container_width=True, key="top_next"):
    snapshot(); advance_phase(game); st.rerun()
if status_e.button("Undo", disabled=not st.session_state.undo_stack, use_container_width=True, key="top_undo"):
    st.session_state.game = st.session_state.undo_stack.pop(); st.rerun()
st.markdown('</div>', unsafe_allow_html=True)

with st.sidebar:
    st.header("Game controls")
    st.metric("Turn", game.turn_number)
    st.write(f"**Active:** {game.active.name}")
    st.write(f"**Phase:** {game.phase}")
    if st.button("Advance phase", type="primary", use_container_width=True):
        snapshot(); advance_phase(game); st.rerun()
    if st.button("Pass turn now", use_container_width=True):
        snapshot()
        game.phase_index = len(PHASES) - 1
        advance_phase(game)
        st.rerun()
    if st.button("Undo last action", disabled=not st.session_state.undo_stack, use_container_width=True):
        st.session_state.game = st.session_state.undo_stack.pop()
        st.rerun()
    if st.button("Restart with new decks", use_container_width=True):
        st.session_state.game = None
        st.session_state.undo_stack = []
        st.rerun()
    st.divider()
    st.subheader("Game log")
    st.code("\n".join(game.log[-25:]) or "No actions yet.", language=None)

# Player summaries
summary_cols = st.columns(len(game.players))
for i, player in enumerate(game.players):
    with summary_cols[i]:
        active_chip = "<span class='active-chip'>ACTIVE</span>" if i == game.active_player else ""
        st.markdown(f"<div class='player-banner'><span class='player-name'>{player.name}</span>{active_chip}</div>", unsafe_allow_html=True)
        a, b, c, d = st.columns(4)
        a.metric("Life", player.life)
        b.metric("Hand", len(player.hand))
        c.metric("Library", len(player.library))
        d.metric("Graveyard", len(player.graveyard))
        commanders = ", ".join(card.name for card in player.command) or "None in command zone"
        st.caption(f"Command zone: {commanders}")

st.divider()
tabs = st.tabs(["Table", "Move", "Effects", "Commander", "Library", "Help"])

with tabs[0]:
    for player_index, player in enumerate(game.players):
        st.markdown(f"<div class='playmat'><div class='zone-label'>{player.name}'s playmat</div></div>", unsafe_allow_html=True)
        zone_tabs = st.tabs(["Battlefield", "Hand", "Graveyard", "Exile", "Command"])
        for tab, zone_name in zip(zone_tabs, ["battlefield", "hand", "graveyard", "exile", "command"]):
            with tab:
                render_zone_cards(player, zone_name, reveal=True)
        st.divider()

with tabs[1]:
    st.header("Move, tap, annotate, or modify any card")
    all_cards: list[Card] = []
    for player in game.players:
        for zone_name in ["hand", "battlefield", "graveyard", "exile", "command"]:
            all_cards.extend(player.zone(zone_name))
    if not all_cards:
        st.info("No selectable cards outside libraries.")
    else:
        selected_uid = st.selectbox("Select card", [c.uid for c in all_cards], format_func=lambda uid: card_label(next(c for c in all_cards if c.uid == uid)))
        located = locate_card(game, selected_uid)
        assert located is not None
        source_player, source_zone, _, selected_card = located
        preview, controls = st.columns([1, 2])
        with preview:
            render_card(selected_card)
        with controls:
            destination_player = st.selectbox("Destination player", range(len(game.players)), format_func=lambda i: game.players[i].name)
            destination_zone = st.selectbox("Destination zone", ZONES)
            bottom = st.checkbox("Put on bottom when moving to library")
            if st.button("Move selected card", type="primary"):
                snapshot(); move_card(game, selected_uid, destination_player, destination_zone, top=not bottom); st.rerun()
            col1, col2, col3 = st.columns(3)
            if col1.button("Tap / untap"):
                snapshot(); selected_card.tapped = not selected_card.tapped; game.add_log(f"{selected_card.name} was {'tapped' if selected_card.tapped else 'untapped'}."); st.rerun()
            if col2.button("Flip face down/up"):
                snapshot(); selected_card.face_down = not selected_card.face_down; game.add_log(f"Changed face-up status of {selected_card.name}."); st.rerun()
            if col3.button("Copy as token"):
                snapshot(); token = copy.deepcopy(selected_card); token.uid = uuid.uuid4().hex; token.notes = "Token/copy created manually"; game.players[destination_player].battlefield.append(token); game.add_log(f"Created a token copy of {selected_card.name}."); st.rerun()
            note = st.text_input("Card note", value=selected_card.notes, key=f"note_{selected_card.uid}")
            if st.button("Save note"):
                snapshot(); selected_card.notes = note; game.add_log(f"Updated note on {selected_card.name}."); st.rerun()
            counter_name = st.text_input("Counter name", value="+1/+1")
            counter_amount = st.number_input("Change counters by", -20, 20, 1)
            if st.button("Apply counter change"):
                snapshot(); selected_card.counters[counter_name] = max(0, selected_card.counters.get(counter_name, 0) + int(counter_amount)); game.add_log(f"Changed {counter_name} counters on {selected_card.name} by {int(counter_amount)}."); st.rerun()

with tabs[2]:
    st.header("Manual effects")
    player_index = st.selectbox("Affected player", range(len(game.players)), format_func=lambda i: game.players[i].name, key="effect_player")
    player = game.players[player_index]
    amount = st.number_input("Amount", 1, 100, 1, key="effect_amount")
    cols = st.columns(5)
    if cols[0].button("Draw"):
        snapshot(); drawn = player.draw(int(amount)); game.add_log(f"{player.name} drew {drawn} card(s)."); st.rerun()
    if cols[1].button("Mill"):
        snapshot(); moved = 0
        for _ in range(int(amount)):
            if player.library:
                player.graveyard.append(player.library.pop()); moved += 1
        game.add_log(f"{player.name} milled {moved} card(s)."); st.rerun()
    if cols[2].button("Gain life"):
        snapshot(); player.life += int(amount); game.add_log(f"{player.name} gained {int(amount)} life."); st.rerun()
    if cols[3].button("Lose life"):
        snapshot(); player.life -= int(amount); game.add_log(f"{player.name} lost {int(amount)} life."); st.rerun()
    if cols[4].button("Discard random"):
        snapshot(); discarded = 0
        for _ in range(int(amount)):
            if player.hand:
                card = random.choice(player.hand); player.hand.remove(card); player.graveyard.append(card); discarded += 1
        game.add_log(f"{player.name} discarded {discarded} random card(s)."); st.rerun()

    st.subheader("Create a simple token or marker")
    token_name = st.text_input("Token name", value="Zombie Token")
    token_type = st.text_input("Type line", value="Token Creature — Zombie")
    token_power = st.text_input("Power", value="2")
    token_toughness = st.text_input("Toughness", value="2")
    token_text = st.text_area("Rules text", value="")
    token_count = st.number_input("Number of tokens", 1, 50, 1)
    if st.button("Create token(s)"):
        snapshot()
        for _ in range(int(token_count)):
            player.battlefield.append(Card(name=token_name, type_line=token_type, oracle_text=token_text, power=token_power, toughness=token_toughness, notes="Manually created token"))
        game.add_log(f"Created {int(token_count)} {token_name} token(s) for {player.name}.")
        st.rerun()

    st.subheader("Mana pool helper")
    mana_cols = st.columns(6)
    for color, col in zip(["W", "U", "B", "R", "G", "C"], mana_cols):
        value = col.number_input(color, 0, 99, player.mana_pool[color], key=f"mana_{player_index}_{color}")
        player.mana_pool[color] = int(value)
    st.caption("Mana is cleared automatically when a new turn starts. Correct payment remains your responsibility.")

with tabs[3]:
    st.header("Commander tools")
    for owner_index, owner in enumerate(game.players):
        st.subheader(owner.name)
        commander_cards = owner.command + [c for c in owner.battlefield + owner.graveyard + owner.exile + owner.hand if c.uid in owner.commander_casts]
        # Register command-zone cards as commanders.
        for card in owner.command:
            owner.commander_casts.setdefault(card.uid, 0)
        if not commander_cards and not owner.command:
            st.info("No commander was identified. Move the commander to the command zone, then refresh this section.")
        for commander in owner.command:
            cast_count = owner.commander_casts.get(commander.uid, 0)
            tax = cast_count * 2
            st.write(f"**{commander.name}** — additional commander tax: **{{{tax}}}**")
            if st.button(f"Cast {commander.name} from command zone", key=f"cast_commander_{commander.uid}"):
                snapshot(); move_card(game, commander.uid, owner_index, "battlefield"); owner.commander_casts[commander.uid] = cast_count + 1; game.add_log(f"{owner.name} cast {commander.name} from the command zone. Commander tax paid manually: {tax}."); st.rerun()
        st.markdown("**Commander damage received**")
        for source_index, source in enumerate(game.players):
            for commander in source.command + source.battlefield + source.graveyard + source.exile + source.hand:
                if commander.uid not in source.commander_casts:
                    continue
                key = f"{owner_index}:{commander.uid}"
                current = game.commander_damage.get(key, 0)
                new_value = st.number_input(f"From {source.name}'s {commander.name}", 0, 99, current, key=f"cmd_damage_{key}")
                if int(new_value) != current:
                    snapshot(); game.commander_damage[key] = int(new_value); game.add_log(f"Set commander damage to {owner.name} from {commander.name} to {int(new_value)}."); st.rerun()

with tabs[4]:
    st.header("Library tools")
    player_index = st.selectbox("Player", range(len(game.players)), format_func=lambda i: game.players[i].name, key="library_player")
    player = game.players[player_index]
    cols = st.columns(4)
    if cols[0].button("Shuffle library"):
        snapshot(); random.shuffle(player.library); game.add_log(f"{player.name} shuffled their library."); st.rerun()
    reveal_count = cols[1].number_input("Top cards", 1, 20, 1)
    if cols[2].button("Reveal top"):
        st.session_state[f"revealed_{player_index}"] = int(reveal_count)
    if cols[3].button("Clear reveal"):
        st.session_state[f"revealed_{player_index}"] = 0
    count = st.session_state.get(f"revealed_{player_index}", 0)
    if count:
        st.subheader(f"Top {min(count, len(player.library))} card(s)")
        top_cards = list(reversed(player.library[-count:]))
        columns = st.columns(min(4, len(top_cards))) if top_cards else []
        for i, card in enumerate(top_cards):
            with columns[i % len(columns)]:
                render_card(card)
    search_query = st.text_input("Search library by card name")
    matches = [c for c in player.library if search_query.casefold() in c.name.casefold()] if search_query else []
    if matches:
        selected_uid = st.selectbox("Matching card", [c.uid for c in matches], format_func=lambda uid: next(c.name for c in matches if c.uid == uid))
        destination = st.selectbox("Move found card to", ["hand", "battlefield", "graveyard", "exile", "command"])
        shuffle_after = st.checkbox("Shuffle afterward", value=True)
        if st.button("Move searched card"):
            snapshot(); move_card(game, selected_uid, player_index, destination)
            if shuffle_after: random.shuffle(player.library)
            game.add_log(f"{player.name}'s library was {'shuffled' if shuffle_after else 'not shuffled'} after searching.")
            st.rerun()

with tabs[5]:
    st.header("How to use this as a learning tool")
    st.markdown("""
1. Control both players honestly and keep each hand visible while learning.
2. Read each card's Oracle text before resolving it.
3. Use **Card mover** for casting, destroying, returning, exiling, sacrificing, or reanimating cards.
4. Use **Manual effects** for draw, mill, life, tokens, counters, and mana.
5. Use **Commander** for tax and damage tracking.
6. Use **Undo** whenever you misunderstand an interaction.

The table intentionally does not decide whether a move is legal. It is closer to physical goldfishing with two decks, but it removes shuffling, searching, counting, and zone-management work.
""")
    st.subheader("Full game log")
    st.code("\n".join(game.log) or "No actions yet.", language=None)

st.divider()
st.caption("Card data and imagery: Scryfall • Precon metadata: MTGJSON • Fan-made learning tool, not affiliated with Wizards of the Coast.")
