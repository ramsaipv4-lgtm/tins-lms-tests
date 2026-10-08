// AC-237 Deterministic shop (games contract D-G21, §13.T6; built after the owner's playtests, D-G24): buying an item
// from packages/games/shop.json deducts exactly its price and adds it to cosmetics / gear; buying it again or without
// enough coins is refused and changes nothing; the same purchases from the same start give the same player document.
// Seed games-player: l1 and nobody else has 65 coins; the run is repeated for l1 in a fresh server per profile, and
// the player document after the purchases is compared with the one computed from the prices.
// data-testids used: app-ready*, player-coins, shop-item-<id> (data-owned), shop-buy-<id>
import { assert, step, see, tid, wait, at, P } from '../journeys/_harness.mjs';
import { gamesJourney, personDocs, readJson, SHOP_JSON } from '../lib/games.mjs';

const num = (t) => Number(String(t).replace(/[^\d-]/g, ''));

gamesJourney({
  name: 'shop', acs: ['AC-237'], title: 'buying deducts the exact price; re-buying and over-spending are refused; purchases are deterministic',
  seeds: ['games-base', 'games-seen', 'games-player'], clock: at(0, '10:00'),
  async run(j) {
    const { items } = readJson(SHOP_JSON);
    assert.ok(Array.isArray(items) && items.length, 'packages/games/shop.json lists items');
    const start = 65;
    const sorted = [...items].sort((a, b) => a.price - b.price || String(a.id).localeCompare(String(b.id)));
    const cheap = sorted.find((i) => i.price > 0 && i.price <= start);
    assert.ok(cheap, 'an item costs at most 65 coins');
    const left = start - cheap.price;
    const dear = sorted.find((i) => i.price > left && i.id !== cheap.id);
    const page = await j.actor('learner', P.l1, { path: '/learn/games/shop?story=off' });
    const coins = async () => num(await (await see(tid(page, 'player-coins'), 'player-coins', 20_000)).innerText());
    assert.equal(await coins(), start, 'starting coins');
    await (await see(tid(page, `shop-buy-${cheap.id}`), `shop-buy-${cheap.id}`)).click();
    await see(page.locator(`[data-testid="shop-item-${cheap.id}"][data-owned="true"]`), `${cheap.id} owned`, 15_000);
    assert.equal(await coins(), left, `buying ${cheap.id} deducts exactly ${cheap.price}`);
    await step(page, `bought ${cheap.id}`);
    const buyAgain = tid(page, `shop-buy-${cheap.id}`);
    if (await buyAgain.count() && await buyAgain.first().isEnabled()) await buyAgain.first().click();
    await wait(1000);
    assert.equal(await coins(), left, 'buying an owned item again is refused');
    if (dear) {
      const b = tid(page, `shop-buy-${dear.id}`);
      if (await b.count() && await b.first().isEnabled()) await b.first().click();
      await wait(1000);
      assert.equal(await coins(), left, `buying ${dear.id} (${dear.price}) with ${left} coins is refused`);
      assert.equal(await page.locator(`[data-testid="shop-item-${dear.id}"][data-owned="true"]`).count(), 0, `${dear.id} is not owned`);
    }
    const player = (await personDocs(j, page, 'l1', 'player'))[0];
    assert.equal(player.coins, left, 'player.coins');
    assert.deepEqual(player.purchases.map((p) => [p.itemId, p.price]), [[cheap.id, cheap.price]], 'exactly one purchase at its price');
    const list = cheap.kind === 'gear' ? player.gear : player.cosmetics;
    assert.ok(list.includes(cheap.id), `${cheap.id} is in player.${cheap.kind === 'gear' ? 'gear' : 'cosmetics'}`);
    await step(page, 'refusals checked');
  },
});
