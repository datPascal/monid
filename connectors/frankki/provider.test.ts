import { assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import {
    loadFixture,
    runEndpoint,
    testBundle,
    testSealedUnit,
} from "@shared/testing";

const fixturesDir = fromFileUrl(new URL("./fixtures/", import.meta.url));
const BASE = "https://backend.frankki.app/api/v1/public/monid/letter";
const ENDPOINTS = [
    "quote",
    "address-check",
    "compose",
    "preview",
    "checkout",
    "track",
];

Deno.test("frankki: six POST endpoints on one host, all FREE", async () => {
    const bundle = await testBundle();
    for (const name of ENDPOINTS) {
        const doc = bundle.endpoints[`frankki#${name}`];
        assertEquals(doc.request.url, `${BASE}/${name}`);
        assertEquals(doc.request.method, "POST");
        // FREE (D27): no vendor meter, only the synthesized empty fns
        assertEquals(doc.usage.consolidate, undefined);
        assertEquals(
            bundle.fnTable[doc.usage.evidence.$fn.key].provenance,
            "core#usage.synthesizedEmpty",
        );
    }
});

Deno.test("frankki#quote happy (recorded 2026-10-27): envelope unwrapped, zero usage", async () => {
    const unit = await testSealedUnit("frankki#quote");
    const fixture = await loadFixture(
        fromFileUrl(
            new URL("./endpoints/quote/fixtures/happy.json", import.meta.url),
        ),
    );
    const result = await runEndpoint({
        unit,
        input: { body: { pageCount: 1, country: "DE" } },
        mode: "replay",
        fixture,
    });
    assertEquals(result.httpStatus, 200);
    assertEquals(result.isProviderError, false);
    assertEquals(result.usage, { credits: {}, evidence: {} });
    const body = fixture.calls[0].res.body as Record<string, unknown>;
    assertEquals(result.output, body.data);
});

Deno.test("frankki#compose happy (synthetic): returns both tokens", async () => {
    const unit = await testSealedUnit("frankki#compose");
    const fixture = await loadFixture(`${fixturesDir}synthetic-compose.json`);
    const result = await runEndpoint({
        unit,
        input: {
            body: {
                subject: "Kuendigung",
                content:
                    "Sehr geehrte Damen und Herren,\nhiermit kuendige ich.\nMit freundlichen Gruessen\nErika Muster",
                sender: {
                    name: "Erika Muster",
                    street: "Hauptstrasse",
                    houseNumber: "1",
                    zip: "10115",
                    city: "Berlin",
                    country: "DE",
                },
                recipient: {
                    name: "Beispiel GmbH",
                    street: "Marktplatz",
                    houseNumber: "5",
                    zip: "80331",
                    city: "Muenchen",
                    country: "DE",
                },
            },
        },
        mode: "replay",
        fixture,
    });
    assertEquals(result.isProviderError, false);
    const output = result.output as Record<string, unknown>;
    assertEquals(output.draftToken, "dft_syntheticsyntheticsynthetic");
    assertEquals(output.trackingToken, "trk_syntheticsyntheticsynthetic");
    assertEquals(output.quoteCents, 349);
});

Deno.test("frankki#checkout review hold (synthetic): the 202 keeps its code", async () => {
    const unit = await testSealedUnit("frankki#checkout");
    const fixture = await loadFixture(
        `${fixturesDir}synthetic-checkout-review.json`,
    );
    const result = await runEndpoint({
        unit,
        input: { body: { draftToken: "dft_syntheticsyntheticsynthetic" } },
        mode: "replay",
        fixture,
    });
    assertEquals(result.httpStatus, 202);
    assertEquals(result.isProviderError, false);
    const output = result.output as Record<string, unknown>;
    assertEquals(output.code, "CONTENT_REVIEW_PENDING");
    assertEquals(result.usage, { credits: {}, evidence: {} });
});

Deno.test("frankki#compose rejected (synthetic): 422 is data with code and message", async () => {
    const unit = await testSealedUnit("frankki#compose");
    const fixture = await loadFixture(
        `${fixturesDir}synthetic-compose-rejected.json`,
    );
    const result = await runEndpoint({
        unit,
        input: {
            body: {
                subject: "Letzte Warnung",
                content: "blocked text",
                sender: { name: "A", street: "B", city: "C", country: "DE" },
                recipient: { name: "D", street: "E", city: "F", country: "DE" },
            },
        },
        mode: "replay",
        fixture,
    });
    assertEquals(result.isProviderError, true);
    assertEquals(result.usage, { credits: {}, evidence: {} });
    const output = result.output as Record<string, unknown>;
    assertEquals(output.code, "CONTENT_REJECTED");
    assertEquals(
        String(output.message).includes("EN: The requested letter content"),
        true,
    );
});
