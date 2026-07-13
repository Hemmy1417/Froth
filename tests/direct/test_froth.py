"""
Direct-mode tests for froth.py — the deterministic surface of the fast-market
contract without GenLayer's AI/consensus stack. Run with:
    python -m pytest tests/direct -q

The genlayer runtime is stubbed (strict Address, a _Payee transfer recorder, a
primeable oracle). The AI ruling is exercised by priming exec_prompt; the input
builder still runs, so multi-source fetching and prompt contents are covered.
"""

import importlib.util
import json
import pathlib
import sys
import types
import pytest


CONTRACT_PATH = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "froth.py"


# ── stubs ────────────────────────────────────────────────────────────────────

class _UserError(Exception):
    pass


class _VmModule:
    UserError = _UserError


class _TreeMap(dict):
    def get(self, k, default=None):
        return super().get(k, default)


class _U256(int):
    def __new__(cls, v):
        return super().__new__(cls, int(v))


class _Address(str):
    def __new__(cls, v):
        if isinstance(v, _Address):
            raise TypeError("cannot convert 'Address' object to bytes")
        return super().__new__(cls, v)


class _PublicViewDeco:
    def __call__(self, fn):
        return fn


class _PublicWriteDeco:
    payable = staticmethod(lambda fn: fn)

    def __call__(self, fn):
        return fn


class _Public:
    view = _PublicViewDeco()
    write = _PublicWriteDeco()


class _FakeEmit:
    def __init__(self):
        self.transfers = []

    def total_to(self, addr):
        return sum(v for (t, v, _) in self.transfers if t.lower() == addr.lower())


class _Evm:
    @staticmethod
    def contract_interface(cls):
        class _Proxy:
            def __init__(self, addr):
                self._addr = str(addr)

            def emit_transfer(self, value, on=None):
                _GL._emit.transfers.append((self._addr, int(value), on))
        return _Proxy


class _NondetWeb:
    @staticmethod
    def render(url, mode="text"):
        if "unreachable" in url:
            raise RuntimeError("403 blocked")
        return f"[stub page text from {url}]"


class _Nondet:
    web = _NondetWeb()

    @staticmethod
    def exec_prompt(task):
        _EqPrinciple.last_input = task
        return _EqPrinciple.canned


class _EqPrinciple:
    canned = '{"winning_option": 0, "confidence": "HIGH", "reasons": ["stub"]}'
    last_input = None

    @classmethod
    def prompt_comparative(cls, fn, principle):
        return fn()


class _GL:
    class Contract:
        pass

    evm = _Evm()
    nondet = _Nondet()
    eq_principle = _EqPrinciple
    public = _Public()
    vm = _VmModule

    class message:
        sender_address = "0x0000000000000000000000000000000000000000"
        value = 0

    _emit = None


def _install_stub():
    mod = types.ModuleType("genlayer")
    mod.gl = _GL
    mod.TreeMap = _TreeMap
    mod.u256 = _U256
    mod.Address = _Address
    mod.__all__ = ["gl", "TreeMap", "u256", "Address"]
    sys.modules["genlayer"] = mod


_install_stub()


def _load_contract():
    spec = importlib.util.spec_from_file_location("froth_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── fixtures ─────────────────────────────────────────────────────────────────

OWNER   = "0x9999999999999999999999999999999999999999"
CREATOR = "0x1111111111111111111111111111111111111111"
ALICE   = "0x2222222222222222222222222222222222222222"
BOB     = "0x3333333333333333333333333333333333333333"
CAROL   = "0x4444444444444444444444444444444444444444"
GEN = 10 ** 18
SRC1 = "https://api.example.com/btc.json"
SRC2 = "https://mirror.example.org/btc"


@pytest.fixture
def module():
    return _load_contract()


@pytest.fixture
def contract(module):
    module.gl.message.sender_address = OWNER
    module.gl.message.value = 0
    module.gl._emit = _FakeEmit()
    return module.Froth(module.Address(OWNER))


def _as(module, sender, value=0):
    module.gl.message.sender_address = sender
    module.gl.message.value = value


def _prime(module, winning_option, confidence="HIGH"):
    module.gl.eq_principle.canned = json.dumps(
        {"winning_option": winning_option, "confidence": confidence, "reasons": ["stub"]}
    )


def _mk(module, contract, ticker="$BTC", cat="crypto", uris=None, fee_bps=200):
    _as(module, CREATOR, 0)
    raw = contract.create_market(
        ticker, cat, "Will $BTC break $100k this week?",
        json.dumps(["Yes", "No"]), json.dumps(uris or [SRC1]), "Settle from the pinned sources.", fee_bps,
    )
    return json.loads(raw)["id"]


def _bet(module, contract, mid, who, idx, amount):
    _as(module, who, amount)
    contract.bet(mid, idx)


def _to_proposed(module, contract, win=0):
    mid = _mk(module, contract)
    _bet(module, contract, mid, ALICE, 0, GEN)
    _bet(module, contract, mid, BOB, 1, GEN)
    _as(module, CREATOR, 0); contract.close_market(mid)
    _prime(module, win)
    _as(module, CAROL, 0); contract.resolve(mid)
    return mid


# ── create ───────────────────────────────────────────────────────────────────

def test_create_market_stores_ticker_and_category(module, contract):
    mid = _mk(module, contract, ticker="$DOGE", cat="crypto", uris=[SRC1, SRC2])
    m = json.loads(contract.get_market(mid))
    assert m["ticker"] == "$DOGE"
    assert m["category"] == "crypto"
    assert m["source_uris"] == [SRC1, SRC2]
    assert m["status"] == "OPEN"


def test_create_accepts_cli_decoded_lists(module, contract):
    _as(module, CREATOR, 0)
    raw = contract.create_market("$ETH", "crypto", "Will ETH flip?", ["Yes", "No"], [SRC1], "crit", 0)
    m = json.loads(raw)
    assert m["options"] == ["Yes", "No"] and m["source_uris"] == [SRC1]


def test_create_unknown_category_falls_back_to_other(module, contract):
    mid = _mk(module, contract, cat="banana")
    assert json.loads(contract.get_market(mid))["category"] == "other"


def test_create_requires_ticker_and_sources(module, contract):
    _as(module, CREATOR, 0)
    with pytest.raises(module.gl.vm.UserError, match="ticker required"):
        contract.create_market("", "crypto", "Q?", json.dumps(["Y", "N"]), json.dumps([SRC1]), "c", 0)
    with pytest.raises(module.gl.vm.UserError, match="between 1 and 3"):
        contract.create_market("$X", "crypto", "Q?", json.dumps(["Y", "N"]), json.dumps([]), "c", 0)


def test_create_rejects_bad_sides_and_fee(module, contract):
    _as(module, CREATOR, 0)
    with pytest.raises(module.gl.vm.UserError, match="between 2 and"):
        contract.create_market("$X", "crypto", "Q?", json.dumps(["only-one"]), json.dumps([SRC1]), "c", 0)
    with pytest.raises(module.gl.vm.UserError, match="fee_bps"):
        contract.create_market("$X", "crypto", "Q?", json.dumps(["Y", "N"]), json.dumps([SRC1]), "c", 501)


# ── betting + trader stats ───────────────────────────────────────────────────

def test_bet_updates_pools_book_and_trader(module, contract):
    mid = _mk(module, contract)
    _bet(module, contract, mid, ALICE, 0, GEN)
    m = json.loads(contract.get_market(mid))
    assert m["pools"][0] == str(GEN) and m["total_pool"] == str(GEN)
    assert json.loads(contract.get_stats())["escrowed_wei"] == str(GEN)
    t = json.loads(contract.get_trader(ALICE))
    assert t["volume_wei"] == str(GEN) and t["markets"] == 1


def test_bet_requires_value_and_open(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="bet must be > 0"):
        contract.bet(mid, 0)
    _as(module, CREATOR, 0); contract.close_market(mid)
    _as(module, ALICE, GEN)
    with pytest.raises(module.gl.vm.UserError, match="not open"):
        contract.bet(mid, 0)


def test_leaderboard_lists_traders(module, contract):
    mid = _mk(module, contract)
    _bet(module, contract, mid, ALICE, 0, GEN)
    _bet(module, contract, mid, BOB, 1, 2 * GEN)
    lb = json.loads(contract.get_leaderboard(10))
    addrs = {t["address"].lower() for t in lb}
    assert ALICE.lower() in addrs and BOB.lower() in addrs
    assert json.loads(contract.get_stats())["total_traders"] == 2


def test_unstake_returns_full_position(module, contract):
    mid = _mk(module, contract)
    _bet(module, contract, mid, ALICE, 0, GEN)
    _as(module, ALICE, 0)
    out = json.loads(contract.unstake(mid))
    assert int(out["returned"]) == GEN
    assert module.gl._emit.total_to(ALICE) == GEN
    assert json.loads(contract.get_market(mid))["total_pool"] == "0"


# ── lifecycle + anti-snipe ───────────────────────────────────────────────────

def test_close_is_creator_only(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="only the creator"):
        contract.close_market(mid)


def test_resolver_cannot_finalize_unappealed(module, contract):
    mid = _to_proposed(module, contract, win=0)   # CAROL resolved
    _as(module, CAROL, 0)
    with pytest.raises(module.gl.vm.UserError, match="can't finalize it unappealed"):
        contract.finalize(mid)


def test_settle_and_winner_claim_with_fee(module, contract):
    mid = _to_proposed(module, contract, win=0)   # fee 2%, YES wins
    _as(module, BOB, 0); contract.finalize(mid)
    _as(module, ALICE, 0)
    out = json.loads(contract.claim(mid))
    gross = 2 * GEN
    fee = gross * 200 // 10000
    assert out["paid"] == str(gross - fee)
    assert module.gl._emit.total_to(ALICE) == gross - fee
    assert module.gl._emit.total_to(CREATOR) == fee
    t = json.loads(contract.get_trader(ALICE))
    assert t["wins"] == 1
    assert json.loads(contract.get_stats())["escrowed_wei"] == "0"


def test_loser_and_double_claim_blocked(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, BOB, 0); contract.finalize(mid)
    _as(module, BOB, 0)
    with pytest.raises(module.gl.vm.UserError, match="no winning bet"):
        contract.claim(mid)
    _as(module, ALICE, 0); contract.claim(mid)
    with pytest.raises(module.gl.vm.UserError, match="already claimed"):
        contract.claim(mid)


def test_low_confidence_refunds(module, contract):
    mid = _to_proposed(module, contract, win=0)
    m = json.loads(contract.get_market(mid)); m["ruling"]["confidence"] = "LOW"
    contract.markets[mid] = json.dumps(m)
    _as(module, BOB, 0)
    assert json.loads(contract.finalize(mid))["status"] == "REFUNDING"
    for who in (ALICE, BOB):
        _as(module, who, 0)
        assert json.loads(contract.claim(mid))["kind"] == "refund"
        assert module.gl._emit.total_to(who) == GEN


# ── bonded appeals ───────────────────────────────────────────────────────────

def test_flipped_appeal_returns_bond(module, contract):
    mid = _to_proposed(module, contract, win=0)
    bond = 2 * GEN // 100
    _prime(module, 1)                              # appeal flips YES → NO
    _as(module, BOB, bond)
    m = json.loads(contract.appeal(mid))
    assert m["appeal_flipped"] is True
    _as(module, CAROL, 0); m = json.loads(contract.finalize(mid))
    assert m["winning_option"] == 1
    assert module.gl._emit.total_to(BOB) == bond
    assert m["total_pool"] == str(2 * GEN)         # pool not inflated


def test_upheld_appeal_bond_joins_pool(module, contract):
    mid = _to_proposed(module, contract, win=0)
    bond = 2 * GEN // 100
    _prime(module, 0)                              # appeal upholds
    _as(module, BOB, bond)
    m = json.loads(contract.appeal(mid))
    assert m["appeal_flipped"] is False
    _as(module, CAROL, 0); m = json.loads(contract.finalize(mid))
    assert m["total_pool"] == str(2 * GEN + bond)
    assert module.gl._emit.total_to(BOB) == 0


def test_appeal_requires_bettor_and_single_shot(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, CAROL, 2 * GEN // 100)             # not a bettor
    with pytest.raises(module.gl.vm.UserError, match="only a bettor"):
        contract.appeal(mid)
    _prime(module, 0)
    _as(module, BOB, 2 * GEN // 100); contract.appeal(mid)
    _as(module, ALICE, 2 * GEN // 100)
    with pytest.raises(module.gl.vm.UserError, match="already appealed"):
        contract.appeal(mid)


def test_stats_shape(module, contract):
    stats = json.loads(contract.get_stats())
    for k in ("season", "total_markets", "total_open", "total_settled", "total_volume",
              "total_appeals", "total_parlays", "total_traders", "escrowed_wei", "paid_out_wei",
              "fees_paid_wei", "parlay_reserve_wei", "parlay_exposure_wei"):
        assert k in stats


# ── parlays (solvent reserve model) ──────────────────────────────────────────

def _settle(module, contract, mid, win):
    _as(module, CREATOR, 0); contract.close_market(mid)
    _prime(module, win)
    _as(module, CAROL, 0); contract.resolve(mid)
    _as(module, BOB, 0); contract.finalize(mid)


def test_parlay_all_hit_pays_from_reserve(module, contract):
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    _bet(module, contract, m1, ALICE, 0, GEN); _bet(module, contract, m1, BOB, 1, GEN)
    _bet(module, contract, m2, ALICE, 0, GEN); _bet(module, contract, m2, BOB, 1, GEN)
    _as(module, OWNER, 50 * GEN); contract.seed_parlay_reserve()   # house bankroll
    _as(module, ALICE, GEN)
    p = json.loads(contract.place_parlay(json.dumps([
        {"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}])))
    # both legs ~50% → ~4x → payout ~4 GEN
    assert int(p["payout"]) > int(p["stake"])
    payout = int(p["payout"])
    _settle(module, contract, m1, 0)   # YES wins
    _settle(module, contract, m2, 0)   # YES wins
    _as(module, ALICE, 0)
    r = json.loads(contract.claim_parlay(p["id"]))
    assert r["status"] == "WON"
    assert module.gl._emit.total_to(ALICE) == payout


def test_parlay_one_miss_loses_stake_to_house(module, contract):
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    for m in (m1, m2):
        _bet(module, contract, m, ALICE, 0, GEN); _bet(module, contract, m, BOB, 1, GEN)
    _as(module, OWNER, 50 * GEN); contract.seed_parlay_reserve()
    reserve0 = int(json.loads(contract.get_stats())["parlay_reserve_wei"])
    _as(module, ALICE, GEN)
    p = json.loads(contract.place_parlay(json.dumps([
        {"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}])))
    _settle(module, contract, m1, 0)   # hit
    _settle(module, contract, m2, 1)   # MISS
    _as(module, ALICE, 0)
    r = json.loads(contract.claim_parlay(p["id"]))
    assert r["status"] == "LOST"
    assert module.gl._emit.total_to(ALICE) == 0
    # stake stayed with the house; exposure released
    assert int(json.loads(contract.get_stats())["parlay_reserve_wei"]) == reserve0 + GEN
    assert json.loads(contract.get_stats())["parlay_exposure_wei"] == "0"


def test_parlay_solvency_guard_rejects_over_exposure(module, contract):
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    for m in (m1, m2):
        _bet(module, contract, m, ALICE, 0, GEN); _bet(module, contract, m, BOB, 1, GEN)
    # tiny reserve can't cover a big parlay payout
    _as(module, OWNER, GEN // 2); contract.seed_parlay_reserve()
    _as(module, ALICE, GEN)
    with pytest.raises(module.gl.vm.UserError, match="reserve can't cover"):
        contract.place_parlay(json.dumps([{"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}]))


# ── reserve shares (the bankroll is a vault its seeders own) ────────────────

def _lost_parlay_cycle(module, contract, bettor, stake):
    """Place a 2-leg parlay that misses one leg: the stake stays with the
    house, so the reserve NAV rises by exactly the stake."""
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    for m in (m1, m2):
        _bet(module, contract, m, ALICE, 0, GEN); _bet(module, contract, m, BOB, 1, GEN)
    _as(module, bettor, stake)
    p = json.loads(contract.place_parlay(json.dumps([
        {"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}])))
    _settle(module, contract, m1, 0)   # hit
    _settle(module, contract, m2, 1)   # MISS
    _as(module, bettor, 0)
    contract.claim_parlay(p["id"])
    return p


def test_first_seed_mints_reserve_shares_one_to_one(module, contract):
    _as(module, OWNER, 5 * GEN)
    out = json.loads(contract.seed_parlay_reserve())
    assert out["shares_minted"] == str(5 * GEN)
    pos = json.loads(contract.get_reserve_position(OWNER))
    assert pos["share_of_reserve_bps"] == 10000
    assert pos["current_value_wei"] == str(5 * GEN)
    assert pos["earned_edge_wei"] == "0"


def test_second_seed_mints_proportional_shares(module, contract):
    _as(module, OWNER, 3 * GEN); contract.seed_parlay_reserve()
    _as(module, CAROL, GEN); contract.seed_parlay_reserve()
    assert json.loads(contract.get_reserve_position(OWNER))["share_of_reserve_bps"] == 7500
    assert json.loads(contract.get_reserve_position(CAROL))["share_of_reserve_bps"] == 2500


def test_house_edge_accrues_to_all_seeders_proportionally(module, contract):
    _as(module, OWNER, 30 * GEN); contract.seed_parlay_reserve()
    _as(module, CAROL, 10 * GEN); contract.seed_parlay_reserve()
    _lost_parlay_cycle(module, contract, ALICE, GEN)   # house pockets 1 GEN

    pos_o = json.loads(contract.get_reserve_position(OWNER))
    pos_c = json.loads(contract.get_reserve_position(CAROL))
    # 40 GEN of shares now claim 41 GEN of NAV — 75/25 split of the edge
    assert int(pos_o["earned_edge_wei"]) == (30 * GEN * (40 * GEN + GEN)) // (40 * GEN) - 30 * GEN
    assert int(pos_c["earned_edge_wei"]) == (10 * GEN * (40 * GEN + GEN)) // (40 * GEN) - 10 * GEN
    assert abs(int(pos_o["earned_edge_wei"]) - 3 * int(pos_c["earned_edge_wei"])) <= 3
    stats = json.loads(contract.get_stats())
    assert int(stats["reserve_share_price_wad"]) > 10 ** 18


def test_withdraw_pays_seed_plus_edge_to_any_seeder(module, contract):
    _as(module, OWNER, 30 * GEN); contract.seed_parlay_reserve()
    _as(module, CAROL, 10 * GEN); contract.seed_parlay_reserve()
    _lost_parlay_cycle(module, contract, ALICE, GEN)

    value_c = int(json.loads(contract.get_reserve_position(CAROL))["current_value_wei"])
    assert value_c > 10 * GEN                       # seed + edge
    _as(module, CAROL, 0)
    out = json.loads(contract.withdraw_parlay_reserve(10 * GEN))   # burn all of CAROL's shares
    assert out["withdrawn_wei"] == str(value_c)
    assert module.gl._emit.total_to(CAROL) == value_c
    # OWNER's slice is untouched by CAROL's exit
    assert json.loads(contract.get_reserve_position(OWNER))["share_of_reserve_bps"] == 10000


def test_withdraw_without_position_rejected(module, contract):
    _as(module, OWNER, 5 * GEN); contract.seed_parlay_reserve()
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="no reserve position"):
        contract.withdraw_parlay_reserve(GEN)


def test_withdraw_more_shares_than_owned_rejected(module, contract):
    _as(module, OWNER, GEN); contract.seed_parlay_reserve()
    _as(module, OWNER, 0)
    with pytest.raises(module.gl.vm.UserError, match="holds"):
        contract.withdraw_parlay_reserve(2 * GEN)


def test_withdraw_during_open_parlay_is_marked_down_to_nav(module, contract):
    # Two seeders; a live parlay marks the book at worst case. A partial exit
    # is allowed but priced on NAV, so the open payout can never be uncovered.
    _as(module, OWNER, 3 * GEN); contract.seed_parlay_reserve()
    _as(module, CAROL, GEN); contract.seed_parlay_reserve()
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    for m in (m1, m2):
        _bet(module, contract, m, ALICE, 0, GEN); _bet(module, contract, m, BOB, 1, GEN)
    _as(module, ALICE, GEN)
    p = json.loads(contract.place_parlay(json.dumps([
        {"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}])))
    profit = int(p["payout"]) - int(p["stake"])
    nav = 4 * GEN + GEN - profit                     # reserve incl. stake, minus liability
    value_c = int(json.loads(contract.get_reserve_position(CAROL))["current_value_wei"])
    assert value_c == (GEN * nav) // (4 * GEN)
    _as(module, CAROL, 0)
    out = json.loads(contract.withdraw_parlay_reserve(GEN))
    assert out["withdrawn_wei"] == str(value_c)
    # solvency intact: remaining reserve still covers the open payout
    stats = json.loads(contract.get_stats())
    assert int(stats["parlay_reserve_wei"]) >= int(stats["parlay_exposure_wei"])


def test_last_shares_cannot_exit_while_parlays_open(module, contract):
    _as(module, OWNER, 4 * GEN); contract.seed_parlay_reserve()
    m1 = _mk(module, contract); m2 = _mk(module, contract)
    for m in (m1, m2):
        _bet(module, contract, m, ALICE, 0, GEN); _bet(module, contract, m, BOB, 1, GEN)
    _as(module, ALICE, GEN)
    contract.place_parlay(json.dumps([
        {"market_id": m1, "option": 0}, {"market_id": m2, "option": 0}]))
    _as(module, OWNER, 0)
    with pytest.raises(module.gl.vm.UserError, match="last shares"):
        contract.withdraw_parlay_reserve(4 * GEN)    # sole seeder, full exit


def test_full_exit_after_settlement_drains_reserve_and_rebootstraps(module, contract):
    _as(module, OWNER, 4 * GEN); contract.seed_parlay_reserve()
    _lost_parlay_cycle(module, contract, ALICE, GEN)
    _as(module, OWNER, 0)
    out = json.loads(contract.withdraw_parlay_reserve(4 * GEN))
    assert out["withdrawn_wei"] == str(5 * GEN)      # seed + the pocketed stake
    stats = json.loads(contract.get_stats())
    assert stats["total_reserve_shares"] == "0"
    assert stats["parlay_reserve_wei"] == "0"        # nothing orphaned
    _as(module, CAROL, GEN)
    assert json.loads(contract.seed_parlay_reserve())["shares_minted"] == str(GEN)


def test_seed_fail_closed_when_nav_zero_with_shares_outstanding(module, contract):
    # The placement guard (reserve + stake >= payout) keeps NAV strictly
    # positive after every parlay, so zero-NAV-with-shares can't arise through
    # normal play — this branch is belt-and-braces. Force the state directly
    # to prove the mint fails closed rather than mispricing.
    _as(module, OWNER, 2 * GEN); contract.seed_parlay_reserve()
    contract.parlay_exposure_wei = module.u256(2 * GEN)   # swallow the whole bankroll
    _as(module, CAROL, GEN)
    with pytest.raises(module.gl.vm.UserError, match="zero headroom"):
        contract.seed_parlay_reserve()


# ── conditional + series ─────────────────────────────────────────────────────

def test_conditional_activates_when_parent_hits(module, contract):
    parent = _mk(module, contract)
    _bet(module, contract, parent, ALICE, 0, GEN); _bet(module, contract, parent, BOB, 1, GEN)
    _as(module, CREATOR, 0)
    child = json.loads(contract.create_market("$ETH", "crypto", "If BTC pumps, ETH too?",
        json.dumps(["Yes", "No"]), json.dumps([SRC1]), "c", 0, "", parent, 0))
    assert child["status"] == "PENDING"
    _settle(module, contract, parent, 0)     # parent YES (option 0) — the required option
    _as(module, ALICE, 0)
    r = json.loads(contract.activate_conditional(child["id"]))
    assert r["status"] == "OPEN"


def test_conditional_voids_when_parent_misses(module, contract):
    parent = _mk(module, contract)
    _bet(module, contract, parent, ALICE, 0, GEN); _bet(module, contract, parent, BOB, 1, GEN)
    _as(module, CREATOR, 0)
    child = json.loads(contract.create_market("$ETH", "crypto", "cond", json.dumps(["Yes", "No"]),
        json.dumps([SRC1]), "c", 0, "", parent, 0))
    _settle(module, contract, parent, 1)     # parent NO — condition (option 0) not met
    _as(module, ALICE, 0)
    assert json.loads(contract.activate_conditional(child["id"]))["status"] == "VOID"


def test_pending_market_cannot_be_bet(module, contract):
    parent = _mk(module, contract)
    _as(module, CREATOR, 0)
    child = json.loads(contract.create_market("$ETH", "crypto", "cond", json.dumps(["Yes", "No"]),
        json.dumps([SRC1]), "c", 0, "", parent, 0))
    _as(module, ALICE, GEN)
    with pytest.raises(module.gl.vm.UserError, match="not open"):
        contract.bet(child["id"], 0)


# ── AI drafting + social + season ────────────────────────────────────────────

def test_suggest_market_returns_draft(module, contract):
    module.gl.eq_principle.canned = json.dumps(
        {"question": "Will $BTC break $100k?", "criteria": "YES if above 100k", "sources": [SRC1]})
    _as(module, ALICE, 0)
    d = json.loads(contract.suggest_market("$BTC", "crypto", "pump season"))
    assert d["ticker"] == "$BTC" and d["question"].startswith("Will")
    assert d["sources"] == [SRC1]
    # stored so the frontend can read it back
    assert json.loads(contract.get_draft(ALICE))["question"] == d["question"]


def test_post_take_and_read(module, contract):
    mid = _mk(module, contract)
    _as(module, ALICE, 0); contract.post_take(mid, "easy yes, funding is bullish")
    _as(module, BOB, 0); contract.post_take(mid, "nah, resistance holds")
    takes = json.loads(contract.get_takes(mid))
    assert len(takes) == 2 and takes[0]["text"].startswith("easy yes")


def test_points_accrue_on_bet_and_win(module, contract):
    mid = _to_proposed(module, contract, win=0)
    _as(module, BOB, 0); contract.finalize(mid)
    _as(module, ALICE, 0); contract.claim(mid)
    t = json.loads(contract.get_trader(ALICE))
    assert int(t["points"]) > 0   # bet volume + win bonus


def test_advance_season_owner_only(module, contract):
    _as(module, ALICE, 0)
    with pytest.raises(module.gl.vm.UserError, match="only the owner"):
        contract.advance_season()
    _as(module, OWNER, 0)
    contract.advance_season()
    assert json.loads(contract.get_stats())["season"] == 2
