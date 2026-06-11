import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log("Creating AI Brain products in Stripe...\n");

  const packs = [
    {
      name: "Starter Pack",
      description: "100 credits — great for exploring AI Brain",
      credits: 100,
      price_cents: 499,
    },
    {
      name: "Pro Pack",
      description: "500 credits — best value for power users",
      credits: 500,
      price_cents: 1999,
    },
    {
      name: "Mega Pack",
      description: "1,000 credits — maximum savings",
      credits: 1000,
      price_cents: 3499,
    },
  ];

  for (const pack of packs) {
    const existing = await stripe.products.search({
      query: `name:'${pack.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ ${pack.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: pack.name,
      description: pack.description,
      metadata: {
        type: "credit_pack",
        creditAmount: String(pack.credits),
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.price_cents,
      currency: "usd",
      metadata: {
        creditAmount: String(pack.credits),
      },
    });

    console.log(
      `✓ Created "${pack.name}": ${product.id} / price ${price.id} ($${(pack.price_cents / 100).toFixed(2)})`
    );
  }

  console.log("\nCreating Pro Plan subscription...");

  const existingPro = await stripe.products.search({
    query: "name:'Pro Plan' AND active:'true'",
  });

  if (existingPro.data.length > 0) {
    console.log(`✓ Pro Plan already exists (${existingPro.data[0].id})`);
  } else {
    const proProduct = await stripe.products.create({
      name: "Pro Plan",
      description: "2,000 credits per month + priority model access",
      metadata: {
        type: "subscription",
        plan: "pro",
        creditAmount: "2000",
      },
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 2900,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: {
        creditAmount: "2000",
        plan: "pro",
      },
    });

    console.log(
      `✓ Created "Pro Plan": ${proProduct.id} / price ${proPrice.id} ($29.00/month)`
    );
  }

  console.log(
    "\n✅ All products ready! Run the API server — syncBackfill() will sync them to the database."
  );
}

createProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
