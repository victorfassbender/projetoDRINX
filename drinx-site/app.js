const MIRROR_CONFIG = {
  companyId: "ac6119b2-46f7-4ec5-9074-7c918fb25318",
  whatsapp: "5561996404046",
  productsEndpoint:
    "https://api.olaclick.app/ms-products/public/companies/ac6119b2-46f7-4ec5-9074-7c918fb25318/categories",
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const slugify = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeForSearch = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const IMAGE_FALLBACK_URL = "https://placehold.co/640x420/f6f8fc/758198?text=Produto";
const ORDERS_DB_KEY = "drinx-orders-db-v1";
const ORDERS_DB_MAX_ITEMS = 250;
const ORDERS_SYNC_DELAY_MS = 450;

const resolveOrdersApiBase = () => {
  const customBase = String(window?.DRINX_API_BASE || "").trim();
  if (customBase) {
    return customBase.replace(/\/$/, "");
  }

  const protocol = window.location.protocol;
  if (protocol === "http:" || protocol === "https:") {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:8787/api";
};

const ORDERS_API_BASE = resolveOrdersApiBase();

let ordersCenterState = null;
let activeCalculatorState = null;
let ordersCache = [];
let ordersSyncTimerId = 0;
let ordersSyncInFlight = false;
let pendingOrdersSnapshot = null;
let paymentModalState = null;
let paymentResolver = null;

const PAYMENT_METHODS = [
  { value: "credito", label: "Crédito" },
  { value: "debito", label: "Débito" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
];

const DEFAULT_PAYMENT_METHOD = "pix";

const hashString = (text) => {
  const value = String(text || "");
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) || 1;
};

const getIllustrativeTags = (product) => {
  const content = normalizeForSearch(
    `${product?.name || ""} ${product?.categoryName || ""} ${product?.description || ""}`
  );

  if (/cerveja|long neck|heineken|corona|spaten|stella|choop|chopp/.test(content)) {
    return "beer,bottle";
  }

  if (/vodka|smirnoff|orloff|absolut|ciroc|grey goose|belvedere/.test(content)) {
    return "vodka,bottle";
  }

  if (/whisky|whiskey|chivas|jack|label|old parr|teacher|ballant|buchana/.test(content)) {
    return "whisky,bottle";
  }

  if (/vinho|adega|tinto|rose|cabernet|malbec|lambrusco/.test(content)) {
    return "wine,bottle";
  }

  if (/gin|tanqueray|bombay|beefeater|seagers|gordon/.test(content)) {
    return "gin,bottle";
  }

  if (/tequila|jose cuervo/.test(content)) {
    return "tequila,bottle";
  }

  if (/licor|amarula|aperol|stock|monin/.test(content)) {
    return "liqueur,bottle";
  }

  if (/espumante|chandon|salton|aurora/.test(content)) {
    return "sparkling,wine";
  }

  if (/refrigerante|suco|coca|fanta|sprite|guarana/.test(content)) {
    return "soft drink,can";
  }

  if (/energetico|energy|red bull|monster|gatorade/.test(content)) {
    return "energy drink,can";
  }

  if (/tabacaria|cigarro|tabaco|seda|isqueiro/.test(content)) {
    return "tobacco,smoke";
  }

  if (/gelo/.test(content)) {
    return "ice,cubes";
  }

  if (/chocolate|doces|bala|pirulito|trident|halls/.test(content)) {
    return "chocolate,candy";
  }

  if (/agua|h2o|coco/.test(content)) {
    return "water,bottle";
  }

  if (/utilidades|preservativo|carvao/.test(content)) {
    return "party,items";
  }

  if (/mercearia|salgadinho|amendoim/.test(content)) {
    return "snack,food";
  }

  if (/combo/.test(content)) {
    return "cocktail,drinks";
  }

  return "beverage,drink";
};

const getIllustrativeImageUrl = (product) => {
  const tags = getIllustrativeTags(product);
  const lock = hashString(`${product?.id || ""}-${product?.name || ""}`) % 997;
  return `https://loremflickr.com/640/420/${encodeURIComponent(tags)}?lock=${lock}`;
};

const getProductImageFromApi = (product) => {
  const images = Array.isArray(product?.images) ? product.images : [];

  const image = images.find(
    (item) => typeof item?.image_url === "string" && item.image_url.trim()
  );
  if (image) {
    return image.image_url.trim();
  }

  const thumbnail = images.find(
    (item) => typeof item?.thumbnail_url === "string" && item.thumbnail_url.trim()
  );
  return thumbnail ? thumbnail.thumbnail_url.trim() : "";
};

const getBrandKey = (name) => {
  const content = normalizeForSearch(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const brandMatchers = [
    ["heineken", /\bheineken\b/],
    ["smirnoff", /\bsmirnoff\b/],
    ["amstel", /\bamstel\b/],
    ["antarctica", /\bantarctica\b/],
    ["budweiser", /\bbudweiser\b/],
    ["brahma", /\bbrahma\b/],
    ["corona", /\bcorona|coronita\b/],
    ["stella", /\bstella\b/],
    ["jack-daniels", /jack\s+daniel/],
    ["johnnie-walker", /johnnie\s+walker|red\s+label/],
    ["chivas", /\bchivas\b/],
    ["ballantines", /ballant/],
    ["old-parr", /old\s+parr/],
    ["absolut", /\babsolut\b/],
    ["orloff", /\borloff\b/],
    ["tanqueray", /\btanqueray\b/],
    ["beefeater", /\bbeefeater\b/],
    ["bombay", /\bbombay\b/],
    ["red-bull", /red\s*bull/],
    ["monster", /\bmonster\b/],
    ["gatorade", /\bgatorade\b/],
    ["coca-cola", /coca\s*-?\s*cola/],
    ["fanta", /\bfanta\b/],
    ["sprite", /\bsprite\b/],
    ["guarana", /\bguarana\b/],
  ];

  for (const [key, matcher] of brandMatchers) {
    if (matcher.test(content)) {
      return key;
    }
  }

  const ignoredTokens = new Set([
    "produto",
    "para",
    "maiores",
    "anos",
    "de",
    "da",
    "do",
    "e",
    "com",
    "sem",
    "copy",
    "ml",
    "kg",
    "l",
    "long",
    "neck",
    "lata",
    "garrafa",
    "unidade",
  ]);

  const token = content
    .split(" ")
    .find((part) => part.length > 2 && !ignoredTokens.has(part));

  return token || content || "produto";
};

const getDisplayVariant = (product) => {
  const variants = Array.isArray(product?.product_variants)
    ? [...product.product_variants].sort(
        (a, b) => Number(a?.position || 0) - Number(b?.position || 0)
      )
    : [];

  const positiveVariant = variants.find((variant) => Number(variant?.price) > 0);
  return positiveVariant || variants[0] || null;
};

const normalizeProduct = (product, categoryName) => {
  const variant = getDisplayVariant(product);
  const price = Number(variant?.price || 0);
  const name = String(product?.name || "Produto").trim();
  const description = String(product?.description || "").trim();
  const variantName = String(variant?.name || "").trim();
  const imageUrl = getProductImageFromApi(product);
  const brandKey = getBrandKey(name);

  return {
    id: product?.id || `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    variantName,
    categoryName,
    price,
    imageUrl,
    brandKey,
    searchText: normalizeForSearch(`${name} ${description} ${variantName} ${categoryName}`),
  };
};

const normalizeCategory = (category) => {
  const name = String(category?.name || "Categoria").trim();
  const products = Array.isArray(category?.products)
    ? [...category.products]
        .filter((product) => product?.visible !== false)
        .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0))
        .map((product) => normalizeProduct(product, name))
    : [];

  return {
    id: slugify(name),
    name,
    products,
  };
};

const getVisibleNormalCategories = (payload) => {
  const categories = Array.isArray(payload?.data) ? payload.data : [];
  const normalizedCategories = categories
    .filter(
      (category) =>
        category?.type === "NORMAL" &&
        category?.visible === true &&
        Array.isArray(category?.products) &&
        category.products.length > 0
    )
    .map(normalizeCategory);

  const brandImageMap = new Map();

  normalizedCategories.forEach((category) => {
    category.products.forEach((product) => {
      if (product.imageUrl && !brandImageMap.has(product.brandKey)) {
        brandImageMap.set(product.brandKey, product.imageUrl);
      }
    });
  });

  normalizedCategories.forEach((category) => {
    category.products.forEach((product) => {
      if (!product.imageUrl) {
        const mappedImage = brandImageMap.get(product.brandKey);
        if (mappedImage) {
          product.imageUrl = mappedImage;
        }
      }
    });
  });

  return normalizedCategories.filter((category) => category.products.length > 0);
};

const fetchMirrorCategories = async () => {
  const response = await fetch(MIRROR_CONFIG.productsEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar dados (${response.status})`);
  }

  const payload = await response.json();
  return getVisibleNormalCategories(payload);
};

const normalizeStoreProduct = (product) => {
  const id = Number(product?.id || 0);
  const name = String(product?.name || "").trim();

  if (!name) {
    return null;
  }

  const rawCategoryName = String(product?.categoryName || "Geral").trim() || "Geral";
  const isCombo = Boolean(product?.isCombo);
  const categoryName =
    isCombo && !normalizeForSearch(rawCategoryName).includes("combo")
      ? "Combos Loja"
      : rawCategoryName;

  const stock = Math.max(0, Math.floor(Number(product?.stock || 0)));
  const price = Math.max(0, Number(product?.price || 0));
  const rawImageUrl = String(product?.imageUrl || "").trim();
  const descriptionText = String(product?.description || "").trim();
  const stockInfo = stock > 0 ? `Estoque: ${stock}` : "";
  const description = [descriptionText, stockInfo].filter(Boolean).join(" • ");
  const imageUrl =
    rawImageUrl ||
    getIllustrativeImageUrl({
      id: id > 0 ? `custom-${id}` : `custom-${slugify(name)}`,
      name,
      categoryName,
      description,
    });

  return {
    id: id > 0 ? `custom-${id}` : `custom-${slugify(name)}-${Date.now()}`,
    name,
    description,
    variantName: "",
    categoryName,
    price,
    imageUrl,
    brandKey: getBrandKey(name),
    searchText: normalizeForSearch(`${name} ${description} ${categoryName}`),
    stock,
  };
};

const fetchStoreProducts = async () => {
  const response = await fetch(`${ORDERS_API_BASE}/store/products`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos da loja (${response.status})`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return list.map(normalizeStoreProduct).filter(Boolean);
};

const mergeStoreProductsIntoCategories = (categories, storeProducts) => {
  const categoryMap = new Map(
    (Array.isArray(categories) ? categories : []).map((category) => [
      category.id,
      {
        ...category,
        products: [...(Array.isArray(category.products) ? category.products : [])],
      },
    ])
  );

  (Array.isArray(storeProducts) ? storeProducts : []).forEach((product) => {
    const categoryId = slugify(product.categoryName || "Geral");

    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        id: categoryId,
        name: product.categoryName || "Geral",
        products: [],
      });
    }

    const targetCategory = categoryMap.get(categoryId);
    targetCategory.products.push(product);
  });

  return [...categoryMap.values()].filter(
    (category) => Array.isArray(category.products) && category.products.length > 0
  );
};

const fetchCategories = async () => {
  const [mirrorResult, storeResult] = await Promise.allSettled([
    fetchMirrorCategories(),
    fetchStoreProducts(),
  ]);

  const mirrorCategories = mirrorResult.status === "fulfilled" ? mirrorResult.value : [];
  const storeProducts = storeResult.status === "fulfilled" ? storeResult.value : [];

  if (mirrorResult.status === "rejected") {
    console.warn("Falha ao carregar espelhamento principal", mirrorResult.reason);
  }

  if (storeResult.status === "rejected") {
    console.warn("Falha ao carregar produtos cadastrados no admin", storeResult.reason);
  }

  const merged = mergeStoreProductsIntoCategories(mirrorCategories, storeProducts);
  if (!merged.length) {
    throw new Error("Nenhum produto disponível no momento");
  }

  return merged;
};

const getOrderKey = (product, note = "") => {
  const safeProduct = normalizeForSearch(product).trim();
  const safeNote = normalizeForSearch(note).trim();
  return `${safeProduct}|${safeNote}`;
};

const normalizeOrderRecord = (record) => {
  const product = String(record?.product || "").trim();
  const note = String(record?.note || "").trim();
  const quantity = Math.max(0, Math.floor(Number(record?.quantity || 0)));
  const unitPrice = Math.max(0, Number(record?.unitPrice || 0));
  const hasPrice = Boolean(record?.hasPrice) && unitPrice > 0;
  const key = String(record?.key || getOrderKey(product, note));
  const updatedAt = Number(record?.updatedAt) || Date.now();

  if (!product || quantity <= 0) {
    return null;
  }

  return {
    key,
    product,
    note,
    quantity,
    unitPrice,
    hasPrice,
    updatedAt,
  };
};

const normalizeOrdersList = (orders) => {
  const normalized = Array.isArray(orders) ? orders.map(normalizeOrderRecord).filter(Boolean) : [];

  return normalized
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, ORDERS_DB_MAX_ITEMS);
};

const readOrdersLocalBackup = () => {
  try {
    const raw = localStorage.getItem(ORDERS_DB_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeOrdersList(parsed);
  } catch (error) {
    console.warn("Falha ao ler pedidos salvos", error);
    return [];
  }
};

const writeOrdersLocalBackup = (orders) => {
  try {
    localStorage.setItem(ORDERS_DB_KEY, JSON.stringify(normalizeOrdersList(orders)));
  } catch (error) {
    console.warn("Falha ao salvar pedidos", error);
  }
};

const clearOrdersLocalBackup = () => {
  try {
    localStorage.removeItem(ORDERS_DB_KEY);
  } catch (error) {
    console.warn("Falha ao limpar pedidos", error);
  }
};

const requestOrdersApi = async (path, options = {}) => {
  const endpoint = `${ORDERS_API_BASE}${path}`;
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (!response.ok) {
    throw new Error(`Falha na API de pedidos (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
};

const syncOrdersToRemote = async (ordersSnapshot) => {
  await requestOrdersApi("/orders/sync", {
    method: "PUT",
    body: JSON.stringify({ orders: normalizeOrdersList(ordersSnapshot) }),
  });
};

const flushOrdersSync = async () => {
  if (ordersSyncInFlight || pendingOrdersSnapshot === null) {
    return;
  }

  const snapshot = pendingOrdersSnapshot;
  pendingOrdersSnapshot = null;
  ordersSyncInFlight = true;

  try {
    await syncOrdersToRemote(snapshot);
  } catch (error) {
    console.warn("API de pedidos indisponível, mantendo backup local", error);
  } finally {
    ordersSyncInFlight = false;

    if (pendingOrdersSnapshot !== null) {
      void flushOrdersSync();
    }
  }
};

const scheduleOrdersSync = () => {
  pendingOrdersSnapshot = normalizeOrdersList(ordersCache);

  if (ordersSyncTimerId) {
    window.clearTimeout(ordersSyncTimerId);
  }

  ordersSyncTimerId = window.setTimeout(() => {
    ordersSyncTimerId = 0;
    void flushOrdersSync();
  }, ORDERS_SYNC_DELAY_MS);
};

const readOrdersDatabase = () => normalizeOrdersList(ordersCache);

const writeOrdersDatabase = (orders) => {
  ordersCache = normalizeOrdersList(orders);
  writeOrdersLocalBackup(ordersCache);
  scheduleOrdersSync();
};

const clearOrdersDatabase = () => {
  ordersCache = [];
  clearOrdersLocalBackup();
  scheduleOrdersSync();
};

const initializeOrdersDatabase = async () => {
  const localOrders = readOrdersLocalBackup();
  ordersCache = localOrders;

  try {
    const payload = await requestOrdersApi("/orders", { method: "GET" });
    const remoteOrders = normalizeOrdersList(payload?.data);

    if (!remoteOrders.length && localOrders.length) {
      writeOrdersDatabase(localOrders);
    } else {
      ordersCache = remoteOrders;
      writeOrdersLocalBackup(ordersCache);
    }
  } catch (error) {
    console.warn("Sem conexão com banco remoto de pedidos, usando backup local", error);
  }
};

const mergeOrdersFromPageItems = (items) => {
  const map = new Map(readOrdersDatabase().map((order) => [order.key, order]));

  items.forEach((item) => {
    if (!item.orderKey) return;

    if (item.quantity > 0) {
      map.set(item.orderKey, {
        key: item.orderKey,
        product: item.product,
        note: item.note,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        hasPrice: item.hasPrice,
        updatedAt: Date.now(),
      });
    } else {
      map.delete(item.orderKey);
    }
  });

  const mergedOrders = [...map.values()].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  writeOrdersDatabase(mergedOrders);
  return mergedOrders;
};

const getPaymentMethodLabel = (paymentMethod) => {
  const found = PAYMENT_METHODS.find((method) => method.value === paymentMethod);
  return found ? found.label : "A definir";
};

const formatWhatsappAmount = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getProductUnitLabel = (productName) => {
  const content = normalizeForSearch(productName);
  return /\b(cx|caixa)\b/.test(content) ? "cx" : "uni";
};

const dedupeCheckoutFooterLines = (lines) => {
  const list = Array.isArray(lines) ? lines : [];
  const seen = {
    delivery: false,
    payment: false,
    reference: false,
  };

  return list.filter((line) => {
    const text = String(line || "").trim();
    if (!text) {
      return false;
    }

    if (text.startsWith("Entrega Sobradinho/DF")) {
      if (seen.delivery) return false;
      seen.delivery = true;
      return true;
    }

    if (text.startsWith("FORMA DE PAGAMENTO")) {
      if (seen.payment) return false;
      seen.payment = true;
      return true;
    }

    if (text.startsWith("referencia: posto do americano.")) {
      if (seen.reference) return false;
      seen.reference = true;
      return true;
    }

    return true;
  });
};

const buildOrderLinesInRequestedPattern = ({ orders, paymentMethod = "" }) => {
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (!list.length) {
    return [];
  }

  let totalKnownPrice = 0;

  const lines = list.map((order) => {
    const quantity = Number(order.quantity || 0);
    const unitPrice = Number(order.unitPrice || 0);
    const subtotal = quantity * unitPrice;
    const unitLabel = getProductUnitLabel(order.product);
    const valueText = formatWhatsappAmount(subtotal);
    const productName = String(order.product || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    totalKnownPrice += subtotal;

    return `${quantity} ${unitLabel} ${productName} (${valueText})`;
  });

  const totalText = formatWhatsappAmount(totalKnownPrice);

  lines.push(`TOTAL (${totalText})`);
  lines.push("Entrega Sobradinho/DF (Colorado ou Grande Colorado)");

  if (paymentMethod) {
    lines.push(`FORMA DE PAGAMENTO (${getPaymentMethodLabel(paymentMethod)} - Pagamento na entrega)`);
  } else {
    lines.push("FORMA DE PAGAMENTO (Pagamento na entrega)");
  }

  lines.push("referencia: posto do americano.");
  return dedupeCheckoutFooterLines(lines);
};

const getOrdersWhatsappUrl = (orders, paymentMethod = "") => {
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (!list.length) {
    return `https://wa.me/${MIRROR_CONFIG.whatsapp}`;
  }

  const lines = buildOrderLinesInRequestedPattern({
    orders: list,
    paymentMethod,
  });

  const message = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${MIRROR_CONFIG.whatsapp}?text=${message}`;
};

const resolvePaymentRequest = (value) => {
  const resolver = paymentResolver;
  paymentResolver = null;

  if (resolver) {
    resolver(value || null);
  }
};

const closePaymentModal = (value = null) => {
  if (!paymentModalState) {
    resolvePaymentRequest(value);
    return;
  }

  paymentModalState.modal.hidden = true;
  paymentModalState.overlay.hidden = true;

  if (paymentModalState.lastFocused && typeof paymentModalState.lastFocused.focus === "function") {
    paymentModalState.lastFocused.focus();
  }

  resolvePaymentRequest(value);
};

const ensurePaymentModal = () => {
  if (paymentModalState) {
    return paymentModalState;
  }

  const overlay = document.createElement("div");
  overlay.className = "payment-overlay";
  overlay.hidden = true;

  const modal = document.createElement("section");
  modal.className = "payment-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Forma de pagamento");

  modal.innerHTML = `
    <div class="payment-head">
      <strong>Forma de pagamento</strong>
      <p>Qual forma prefere? Pagamento apenas na hora.</p>
    </div>
    <div class="payment-options">
      ${PAYMENT_METHODS.map(
        (method, index) => `
        <label class="payment-option">
          <input type="radio" name="paymentMethod" value="${method.value}" ${
          index === 0 ? "checked" : ""
        }>
          <span>${method.label}</span>
        </label>
      `
      ).join("")}
    </div>
    <div class="payment-actions">
      <button type="button" class="btn btn-soft w-100" data-payment-cancel>Cancelar</button>
      <button type="button" class="btn btn-primary w-100" data-payment-confirm>Continuar</button>
    </div>
  `;

  document.body.append(overlay, modal);

  paymentModalState = {
    overlay,
    modal,
    confirm: modal.querySelector("[data-payment-confirm]"),
    cancel: modal.querySelector("[data-payment-cancel]"),
    lastFocused: null,
  };

  overlay.addEventListener("click", () => {
    closePaymentModal(null);
  });

  paymentModalState.cancel?.addEventListener("click", () => {
    closePaymentModal(null);
  });

  paymentModalState.confirm?.addEventListener("click", () => {
    const selected = modal.querySelector("input[name='paymentMethod']:checked");
    const method = selected?.value || "";
    closePaymentModal(method || null);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && paymentModalState && !paymentModalState.modal.hidden) {
      closePaymentModal(null);
    }
  });

  return paymentModalState;
};

const askPaymentMethod = () =>
  new Promise((resolve) => {
    const modalState = ensurePaymentModal();

    if (paymentResolver) {
      paymentResolver(null);
    }

    paymentResolver = resolve;
    modalState.lastFocused = document.activeElement;
    modalState.overlay.hidden = false;
    modalState.modal.hidden = false;

    const preferredOption = modalState.modal.querySelector(
      `input[name='paymentMethod'][value='${DEFAULT_PAYMENT_METHOD}']`
    );
    const firstOption = modalState.modal.querySelector("input[name='paymentMethod']");

    if (preferredOption) {
      preferredOption.checked = true;
    } else if (firstOption) {
      firstOption.checked = true;
    }

    modalState.confirm?.focus();
  });

const closeOrdersCenter = () => {
  if (!ordersCenterState) return;

  ordersCenterState.panel.classList.remove("open");
  ordersCenterState.panel.setAttribute("aria-hidden", "true");
  ordersCenterState.overlay.hidden = true;
};

const openOrdersCenter = () => {
  if (!ordersCenterState) return;

  ordersCenterState.panel.classList.add("open");
  ordersCenterState.panel.setAttribute("aria-hidden", "false");
  ordersCenterState.overlay.hidden = false;
};

const renderOrdersCenter = () => {
  if (!ordersCenterState) return;

  const orders = readOrdersDatabase();
  const totalUnits = orders.reduce((sum, order) => sum + order.quantity, 0);
  const totalProducts = orders.length;
  const hasKnownPrice = orders.some((order) => order.hasPrice);
  const totalKnownPrice = orders.reduce(
    (sum, order) => sum + (order.hasPrice ? order.quantity * order.unitPrice : 0),
    0
  );

  ordersCenterState.count.textContent = totalUnits > 99 ? "99+" : String(totalUnits);

  if (!totalProducts) {
    ordersCenterState.meta.textContent = "Nenhum pedido salvo";
    ordersCenterState.list.innerHTML =
      '<p class="orders-empty">Adicione quantidades e clique em <strong>Pedir</strong> para salvar.</p>';
  } else {
    const priceInfo = hasKnownPrice ? ` • ${formatMoney(totalKnownPrice)}` : "";
    ordersCenterState.meta.textContent = `${totalProducts} produto(s) • ${totalUnits} unidade(s)${priceInfo}`;

    ordersCenterState.list.innerHTML = `
      <ul>
        ${orders
          .map((order) => {
            const subtotal = order.quantity * order.unitPrice;
            const subtotalText = order.hasPrice ? formatMoney(subtotal) : "Sob consulta";

            return `
              <li class="orders-item">
                <div>
                  <strong>${escapeHtml(order.product)} x${order.quantity}</strong>
                  ${order.note ? `<p class="orders-item-note">${escapeHtml(order.note)}</p>` : ""}
                </div>
                <span class="orders-item-price">${escapeHtml(subtotalText)}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  ordersCenterState.send.href = getOrdersWhatsappUrl(orders, DEFAULT_PAYMENT_METHOD);
  ordersCenterState.send.classList.toggle("is-disabled", !totalProducts);
  ordersCenterState.send.setAttribute("aria-disabled", totalProducts ? "false" : "true");
};

const ensureOrdersCenter = () => {
  if (ordersCenterState) {
    return;
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "orders-float";
  toggle.setAttribute("aria-label", "Ver pedidos salvos");
  toggle.innerHTML = '<span aria-hidden="true">🧾</span><span class="orders-count" data-orders-count>0</span>';

  const panel = document.createElement("aside");
  panel.className = "orders-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="orders-panel-head">
      <strong>Pedidos salvos</strong>
      <button type="button" class="orders-close" data-orders-close aria-label="Fechar">×</button>
    </div>
    <p class="orders-meta" data-orders-meta></p>
    <div class="orders-list" data-orders-list></div>
    <div class="orders-actions">
      <a class="btn btn-primary w-100 orders-send" data-orders-send target="_blank" rel="noopener" href="https://wa.me/${MIRROR_CONFIG.whatsapp}">
        Enviar tudo no WhatsApp
      </a>
      <button class="btn btn-soft w-100" type="button" data-orders-clear>
        Limpar pedidos
      </button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.className = "orders-overlay";
  overlay.hidden = true;

  document.body.append(toggle, panel, overlay);

  ordersCenterState = {
    toggle,
    count: toggle.querySelector("[data-orders-count]"),
    panel,
    meta: panel.querySelector("[data-orders-meta]"),
    list: panel.querySelector("[data-orders-list]"),
    send: panel.querySelector("[data-orders-send]"),
    clear: panel.querySelector("[data-orders-clear]"),
    close: panel.querySelector("[data-orders-close]"),
    overlay,
  };

  toggle.addEventListener("click", () => {
    if (panel.classList.contains("open")) {
      closeOrdersCenter();
    } else {
      renderOrdersCenter();
      openOrdersCenter();
    }
  });

  ordersCenterState.close?.addEventListener("click", closeOrdersCenter);
  overlay.addEventListener("click", closeOrdersCenter);

  ordersCenterState.send?.addEventListener("click", async (event) => {
    event.preventDefault();

    const orders = readOrdersDatabase();
    if (!orders.length) {
      return;
    }

    const paymentMethod = await askPaymentMethod();
    if (!paymentMethod) {
      return;
    }

    const whatsappUrl = getOrdersWhatsappUrl(orders, paymentMethod);
    window.open(whatsappUrl, "_blank", "noopener");
    renderOrdersCenter();
  });

  ordersCenterState.clear?.addEventListener("click", () => {
    clearOrdersDatabase();

    if (activeCalculatorState?.items?.length) {
      activeCalculatorState.items.forEach((item) => {
        item.quantity = 0;
      });

      activeCalculatorState.updateTotals();
    }

    renderOrdersCenter();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOrdersCenter();
    }
  });

  renderOrdersCenter();
};

const renderProductCard = (product) => {
  const detailText = [product.description, product.variantName].filter(Boolean).join(" ");
  const imageUrl = product.imageUrl || getIllustrativeImageUrl(product);
  const priceHtml =
    product.price > 0
      ? `<p class="price">${escapeHtml(formatMoney(product.price))}</p>`
      : '<p class="price-note">Preço sob consulta</p>';

  return `
    <article class="order-card" data-name="${escapeHtml(product.searchText)}" data-price="${product.price}">
      <figure class="product-media">
        <img
          class="product-image"
          src="${escapeHtml(imageUrl)}"
          alt="Imagem ilustrativa de ${escapeHtml(product.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='${IMAGE_FALLBACK_URL}';"
        >
      </figure>
      <span class="tag">${escapeHtml(product.categoryName)}</span>
      <h3>${escapeHtml(product.name)}</h3>
      ${detailText ? `<p class="desc">${escapeHtml(detailText)}</p>` : ""}
      ${priceHtml}
      <a
        class="btn btn-primary w-100 order-link"
        href="https://wa.me/${MIRROR_CONFIG.whatsapp}"
        data-product="${escapeHtml(product.name)}"
        data-note="${escapeHtml(detailText)}"
      >
        Pedir
      </a>
    </article>
  `;
};

const buildOrderMessage = ({
  product,
  quantity,
  unitPrice,
  subtotal,
  hasPrice,
  note,
  paymentMethod = "",
}) => {
  const lines = buildOrderLinesInRequestedPattern({
    orders: [
      {
        product,
        quantity,
        unitPrice,
        subtotal,
        hasPrice,
        note,
      },
    ],
    paymentMethod,
  });

  return encodeURIComponent(lines.join("\n"));
};

const ensureCalculatorSummary = () => {
  const page = document.querySelector("main[data-page]");
  if (!page) return null;

  const existing = page.querySelector(".calc-summary");
  if (existing) return existing;

  const summary = document.createElement("section");
  summary.className = "calc-summary";
  summary.setAttribute("aria-live", "polite");
  summary.innerHTML = `
    <div>
      <strong>Calculadora de quantidade</strong>
      <p class="calc-note">Use + e - para somar ou subtrair os produtos.</p>
    </div>
    <strong class="calc-total" data-calc-total>0 unidade(s)</strong>
  `;

  const topContainer = page.querySelector(".container");
  const sectionHead = topContainer?.querySelector(".section-head");

  if (sectionHead) {
    sectionHead.insertAdjacentElement("afterend", summary);
  } else if (topContainer) {
    topContainer.prepend(summary);
  } else {
    page.prepend(summary);
  }

  return summary;
};

const setupOrderCalculator = () => {
  const cards = Array.from(document.querySelectorAll(".order-card"));
  if (!cards.length) return;

  const items = [];

  cards.forEach((card) => {
    const actionButton = card.querySelector(".order-link");
    if (!actionButton) return;

    const product = actionButton.dataset.product || card.querySelector("h3")?.textContent || "Produto";
    const note = actionButton.dataset.note || "";
    const unitPrice = Number(card.dataset.price || 0);
    const hasPrice = unitPrice > 0;

    const controls = document.createElement("div");
    controls.className = "qty-controls";

    const minusButton = document.createElement("button");
    minusButton.type = "button";
    minusButton.className = "qty-btn";
    minusButton.textContent = "-";

    const qtyValue = document.createElement("span");
    qtyValue.className = "qty-value";
    qtyValue.textContent = "0";

    const plusButton = document.createElement("button");
    plusButton.type = "button";
    plusButton.className = "qty-btn";
    plusButton.textContent = "+";

    controls.append(minusButton, qtyValue, plusButton);

    const subtotal = document.createElement("p");
    subtotal.className = "subtotal";

    actionButton.insertAdjacentElement("beforebegin", controls);
    actionButton.insertAdjacentElement("beforebegin", subtotal);

    items.push({
      quantity: 0,
      product,
      note,
      orderKey: getOrderKey(product, note),
      unitPrice,
      hasPrice,
      minusButton,
      plusButton,
      qtyValue,
      subtotal,
      actionButton,
    });
  });

  if (!items.length) return;

  ensureOrdersCenter();

  const savedOrdersMap = new Map(readOrdersDatabase().map((order) => [order.key, order]));
  items.forEach((item) => {
    const savedOrder = savedOrdersMap.get(item.orderKey);
    if (savedOrder) {
      item.quantity = savedOrder.quantity;
    }
  });

  const summary = ensureCalculatorSummary();
  const summaryTotal = summary?.querySelector("[data-calc-total]");
  const summaryNote = summary?.querySelector(".calc-note");

  const updateTotals = () => {
    let totalUnits = 0;
    let selectedProducts = 0;

    items.forEach((item) => {
      const subtotalValue = item.quantity * item.unitPrice;
      item.qtyValue.textContent = String(item.quantity);
      item.minusButton.disabled = item.quantity <= 0;
      item.subtotal.textContent = item.hasPrice
        ? `Subtotal: ${formatMoney(subtotalValue)}`
        : "Subtotal: sob consulta";

      totalUnits += item.quantity;
      if (item.quantity > 0) {
        selectedProducts += 1;

        const message = buildOrderMessage({
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: subtotalValue,
          hasPrice: item.hasPrice,
          note: item.note,
          paymentMethod: DEFAULT_PAYMENT_METHOD,
        });

        item.actionButton.href = `https://wa.me/${MIRROR_CONFIG.whatsapp}?text=${message}`;
        item.actionButton.classList.remove("is-disabled");
        item.actionButton.setAttribute("aria-disabled", "false");
      } else {
        item.actionButton.href = `https://wa.me/${MIRROR_CONFIG.whatsapp}`;
        item.actionButton.classList.add("is-disabled");
        item.actionButton.setAttribute("aria-disabled", "true");
      }
    });

    if (summaryTotal) {
      summaryTotal.textContent = `${totalUnits} unidade(s)`;
    }

    if (summaryNote) {
      summaryNote.textContent =
        totalUnits > 0
          ? `${selectedProducts} produto(s) selecionado(s).`
          : "Use + e - para somar ou subtrair os produtos.";
    }

    mergeOrdersFromPageItems(items);
    renderOrdersCenter();
  };

  activeCalculatorState = {
    items,
    updateTotals,
  };

  items.forEach((item) => {
    item.minusButton.addEventListener("click", () => {
      if (item.quantity > 0) {
        item.quantity -= 1;
        updateTotals();
      }
    });

    item.plusButton.addEventListener("click", () => {
      item.quantity += 1;
      updateTotals();
    });

    item.actionButton.addEventListener("click", async (event) => {
      event.preventDefault();

      if (item.quantity <= 0) {
        return;
      }

      const paymentMethod = await askPaymentMethod();
      if (!paymentMethod) {
        return;
      }

      const subtotalValue = item.quantity * item.unitPrice;
      const message = buildOrderMessage({
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: subtotalValue,
        hasPrice: item.hasPrice,
        note: item.note,
        paymentMethod,
      });

      mergeOrdersFromPageItems(items);
      renderOrdersCenter();

      window.open(`https://wa.me/${MIRROR_CONFIG.whatsapp}?text=${message}`, "_blank", "noopener");
    });
  });

  updateTotals();
};

const setupCatalogFilters = () => {
  const page = document.querySelector("main[data-page='catalog']");
  if (!page) return;

  const searchInput = document.getElementById("searchInput");
  const chips = Array.from(document.querySelectorAll("#categoryChips .chip[data-category]"));
  const sections = Array.from(document.querySelectorAll("section.category[data-category]"));
  const info = document.getElementById("categoriesInfo");
  const emptyState = document.getElementById("catalogEmpty");

  if (!sections.length) return;

  const hasCategory = (id) => id === "all" || sections.some((section) => section.dataset.category === id);

  const hashCategory = decodeURIComponent(window.location.hash.replace("#", "")).trim();
  const state = {
    query: "",
    category: hasCategory(hashCategory) ? hashCategory : "all",
  };

  const applyFilter = () => {
    let visibleProducts = 0;
    let visibleCategories = 0;

    sections.forEach((section) => {
      const sectionId = section.dataset.category || "";
      const cards = Array.from(section.querySelectorAll(".order-card"));
      const categoryMatch = state.category === "all" || sectionId === state.category;
      let sectionVisible = 0;

      cards.forEach((card) => {
        const text = card.getAttribute("data-name") || "";
        const searchMatch = !state.query || text.includes(state.query);
        const show = categoryMatch && searchMatch;

        card.style.display = show ? "" : "none";
        if (show) {
          sectionVisible += 1;
          visibleProducts += 1;
        }
      });

      section.style.display = sectionVisible > 0 ? "" : "none";
      if (sectionVisible > 0) {
        visibleCategories += 1;
      }
    });

    chips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.category === state.category);
    });

    if (info) {
      info.textContent = `${visibleProducts} produto(s) em ${visibleCategories} categoria(s)`;
    }

    if (emptyState) {
      emptyState.hidden = visibleProducts > 0;
    }
  };

  chips.forEach((chip) => {
    chip.addEventListener("click", (event) => {
      const nextCategory = chip.dataset.category || "all";
      event.preventDefault();
      state.category = nextCategory;

      if (nextCategory === "all") {
        history.replaceState(null, "", window.location.pathname);
      } else {
        history.replaceState(null, "", `#${nextCategory}`);
      }

      applyFilter();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.query = normalizeForSearch(searchInput.value.trim());
      applyFilter();
    });
  }

  window.addEventListener("hashchange", () => {
    const nextCategory = decodeURIComponent(window.location.hash.replace("#", "")).trim();
    state.category = hasCategory(nextCategory) ? nextCategory : "all";
    applyFilter();
  });

  applyFilter();
};

const getComboLinkUrl = (comboName) => `./combos.html?combo=${encodeURIComponent(comboName)}`;

const highlightComboFromQuery = () => {
  const query = new URLSearchParams(window.location.search).get("combo");
  if (!query) return;

  const target = normalizeForSearch(query.trim());
  if (!target) return;

  const cards = Array.from(document.querySelectorAll("#combosContainer .order-card"));
  const matchedCard = cards.find((card) => {
    const searchableText = card.getAttribute("data-name") || "";
    return searchableText.includes(target);
  });

  if (!matchedCard) return;

  matchedCard.classList.add("combo-highlight");
  matchedCard.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    matchedCard.classList.remove("combo-highlight");
  }, 2200);
};

const renderComboTicker = (categories) => {
  const ticker = document.getElementById("comboTicker");
  const track = document.getElementById("comboTickerTrack");

  if (!ticker || !track) return;

  const comboProducts = categories
    .filter((category) => normalizeForSearch(category.name).includes("combo"))
    .flatMap((category) => category.products)
    .filter((product, index, list) => {
      const name = normalizeForSearch(product?.name || "");
      return name && list.findIndex((entry) => normalizeForSearch(entry?.name || "") === name) === index;
    })
    .slice(0, 10);

  if (!comboProducts.length) {
    ticker.hidden = true;
    track.innerHTML = "";
    return;
  }

  const itemMarkup = comboProducts
    .map((product) => {
      const comboHref = getComboLinkUrl(product.name);
      const priceText = product.price > 0 ? ` • ${formatMoney(product.price)}` : "";
      return `<a class="combo-item combo-item-link" href="${escapeHtml(comboHref)}" aria-label="Ver combo ${escapeHtml(
        product.name
      )}">${escapeHtml(product.name)}${escapeHtml(priceText)}</a>`;
    })
    .join("");

  track.innerHTML = `${itemMarkup}${itemMarkup}`;
  ticker.hidden = false;
};

const renderCatalogPage = (categories) => {
  const chipsContainer = document.getElementById("categoryChips");
  const categoriesContainer = document.getElementById("categoriesContainer");

  if (!chipsContainer || !categoriesContainer) return;

  chipsContainer.innerHTML = [
    '<a class="chip active" href="#all" data-category="all">Todos</a>',
    ...categories.map(
      (category) =>
        `<a class="chip" href="#${escapeHtml(category.id)}" data-category="${escapeHtml(
          category.id
        )}">${escapeHtml(category.name)}</a>`
    ),
  ].join("");

  categoriesContainer.innerHTML = categories
    .map(
      (category) => `
      <section id="${escapeHtml(category.id)}" class="container category" data-category="${escapeHtml(
        category.id
      )}">
        <h2>${escapeHtml(category.name)}</h2>
        <div class="grid">
          ${category.products.map(renderProductCard).join("")}
        </div>
      </section>
    `
    )
    .join("");

  renderComboTicker(categories);
  setupCatalogFilters();
  setupOrderCalculator();
};

const renderCombosPage = (categories) => {
  const combosContainer = document.getElementById("combosContainer");
  const combosInfo = document.getElementById("combosInfo");
  const combosEmpty = document.getElementById("combosEmpty");

  if (!combosContainer) return;

  const comboCategories = categories.filter((category) =>
    normalizeForSearch(category.name).includes("combo")
  );

  const comboProducts = comboCategories.flatMap((category) =>
    category.products.map((product) => ({
      ...product,
      categoryName: category.name,
    }))
  );

  if (!comboProducts.length) {
    combosContainer.innerHTML = "";
    if (combosInfo) {
      combosInfo.textContent = "Nenhum combo disponível no momento";
    }
    if (combosEmpty) {
      combosEmpty.hidden = false;
    }
    return;
  }

  combosContainer.innerHTML = comboProducts.map(renderProductCard).join("");

  if (combosInfo) {
    combosInfo.textContent = `${comboProducts.length} item(ns)`;
  }

  if (combosEmpty) {
    combosEmpty.hidden = true;
  }

  setupOrderCalculator();
  highlightComboFromQuery();
};

const renderPageError = (message) => {
  const catalogContainer = document.getElementById("categoriesContainer");
  const combosContainer = document.getElementById("combosContainer");
  const emptyCatalog = document.getElementById("catalogEmpty");
  const emptyCombos = document.getElementById("combosEmpty");

  if (catalogContainer) {
    catalogContainer.innerHTML = `<section class="container"><p class="empty-note">${escapeHtml(
      message
    )}</p></section>`;
  }

  if (combosContainer) {
    combosContainer.innerHTML = "";
  }

  if (emptyCatalog) {
    emptyCatalog.hidden = false;
    emptyCatalog.textContent = message;
  }

  if (emptyCombos) {
    emptyCombos.hidden = false;
    emptyCombos.textContent = message;
  }
};

const init = async () => {
  const page = document.querySelector("main[data-page]");
  if (!page) return;

  await initializeOrdersDatabase();
  ensureOrdersCenter();
  renderOrdersCenter();

  try {
    const categories = await fetchCategories();

    if (page.dataset.page === "catalog") {
      renderCatalogPage(categories);
    }

    if (page.dataset.page === "combos") {
      renderCombosPage(categories);
    }
  } catch (error) {
    console.error(error);
    renderPageError("Não foi possível carregar o cardápio agora. Tente novamente em instantes.");
  }
};

init();