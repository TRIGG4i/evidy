const clampMoney = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} invalide`);
  return number;
};

export const marginRateForItemUsd = (itemUsd) => {
  const p = clampMoney(itemUsd, 'Prix article');
  if (p <= 350) return 0.30;
  if (p <= 900) return 0.25;
  return 0.15;
};

export const computeServiceFeeMga = ({ itemUsd, domesticShippingUsd = 0, visaRate }) => {
  const item = clampMoney(itemUsd, 'Prix article');
  const domestic = clampMoney(domesticShippingUsd, 'Livraison US');
  const rate = clampMoney(visaRate, 'Taux VISA');
  const baseMga = (item + domestic) * rate;
  const tierRate = marginRateForItemUsd(item);

  const floor75k = 75000;
  const floorAt350 = 350 * rate * 0.30;
  const floorAt900 = 900 * rate * 0.25;

  let continuityFloor = 0;
  if (item > 350 && item <= 900) continuityFloor = floorAt350;
  if (item > 900) continuityFloor = floorAt900;

  const fee = Math.max(baseMga * tierRate, floor75k, continuityFloor);
  return { feeMga: Math.round(fee), tierRate, baseMga, continuityFloor: Math.round(continuityFloor) };
};

export const cardFeeMga = ({ amountMga, percent, fixedMga }) => {
  const amount = clampMoney(amountMga, 'Montant carte');
  return Math.round(amount * (clampMoney(percent, 'Frais carte') / 100) + clampMoney(fixedMga, 'Frais fixe'));
};

export const quote = (input) => {
  const itemUsd = clampMoney(input.itemUsd, 'Prix article');
  const domesticShippingUsd = clampMoney(input.domesticShippingUsd || 0, 'Livraison US');
  const internationalShippingUsd = clampMoney(input.internationalShippingUsd, 'Transport international');
  const planetExpressFeesUsd = clampMoney(input.planetExpressFeesUsd || 5, 'Frais Planet Express');
  const visaRate = clampMoney(input.visaRate, 'Taux VISA');
  const cardFeePercent = clampMoney(input.cardFeePercent ?? 3, 'Pourcentage carte');
  const cardFixedMga = clampMoney(input.cardFixedMga ?? 4500, 'Frais fixe carte');
  const customsReserveMga = clampMoney(input.customsReserveMga || 0, 'Réserve arrivée');
  const localDeliveryMga = clampMoney(input.localDeliveryMga || 0, 'Livraison locale');

  const purchaseUsd = itemUsd + domesticShippingUsd;
  const freightUsd = internationalShippingUsd + planetExpressFeesUsd;
  const purchaseMga = purchaseUsd * visaRate;
  const freightMga = freightUsd * visaRate;

  const purchaseCardFee = cardFeeMga({ amountMga: purchaseMga, percent: cardFeePercent, fixedMga: cardFixedMga });
  const freightCardFee = cardFeeMga({ amountMga: freightMga, percent: cardFeePercent, fixedMga: cardFixedMga });
  const service = computeServiceFeeMga({ itemUsd, domesticShippingUsd, visaRate });

  const costBeforeService = Math.round(
    purchaseMga + freightMga + purchaseCardFee + freightCardFee + customsReserveMga + localDeliveryMga
  );
  const totalMga = Math.round(costBeforeService + service.feeMga);

  return {
    currency: 'MGA',
    itemUsd,
    domesticShippingUsd,
    purchaseUsd,
    internationalShippingUsd,
    planetExpressFeesUsd,
    freightUsd,
    visaRate,
    purchaseMga: Math.round(purchaseMga),
    freightMga: Math.round(freightMga),
    purchaseCardFeeMga: purchaseCardFee,
    freightCardFeeMga: freightCardFee,
    customsReserveMga: Math.round(customsReserveMga),
    localDeliveryMga: Math.round(localDeliveryMga),
    serviceFeeMga: service.feeMga,
    serviceRate: service.tierRate,
    continuityFloorMga: service.continuityFloor,
    costBeforeServiceMga: costBeforeService,
    totalMga
  };
};
