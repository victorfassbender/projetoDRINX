const WHATSAPP_NUMBER = "5561996404046";
const IMAGE_PLACEHOLDER =
  "https://via.placeholder.com/130x155/f2f4f8/9aa3b2?text=Bebida";

const defaultProducts = [
  {
    nome: "Heineken Long Neck",
    preco: 7.99,
    imagem: "https://m.media-amazon.com/images/I/61mS7wYh0XL._AC_SL1500_.jpg",
    categoria: "cerveja",
    descricao: "Long neck 330ml gelada",
    promocao: true,
  },
  {
    nome: "Budweiser 350ml",
    preco: 5.99,
    imagem: "https://m.media-amazon.com/images/I/71VY9w8I9jL._AC_SL1500_.jpg",
    categoria: "cerveja",
    descricao: "Lata 350ml",
    promocao: false,
  },
  {
    nome: "Smirnoff 998ml",
    preco: 39.9,
    imagem: "https://m.media-amazon.com/images/I/61vEu4aV0xL._AC_SL1500_.jpg",
    categoria: "vodka",
    descricao: "Vodka tradicional",
    promocao: false,
  },
  {
    nome: "Tanqueray London Dry",
    preco: 119.9,
    imagem: "https://m.media-amazon.com/images/I/61R7GdJQfEL._AC_SL1500_.jpg",
    categoria: "gin",
    descricao: "Gin premium 750ml",
    promocao: true,
  },
  {
    nome: "Energético 250ml",
    preco: 8.5,
    imagem: "https://m.media-amazon.com/images/I/51V4h8u9mwL._AC_SL1000_.jpg",
    categoria: "energetico",
    descricao: "Lata 250ml",
    promocao: false,
  },
  {
    nome: "Royal Salute",
    preco: 1199.99,
    imagem: "royal.png",
    categoria: "whisky",
    descricao: "Whisky escocês premium",
    promocao: true,
  },
  {
    nome: "Chivas Regal 12 anos",
    preco: 149.9,
    imagem: "chivas.png",
    categoria: "whisky",
    descricao: "Whisky escocês 1L",
    promocao: false,
  },
  {
    nome: "Ballantine's Finest",
    preco: 99.9,
    imagem: "ballantines.png",
    categoria: "whisky",
    descricao: "Whisky escocês 1L",
    promocao: false,
  },
  {
    nome: "Jack Daniel's",
    preco: 139.9,
    imagem: "jack.png",
    categoria: "whisky",
    descricao: "Tennessee whiskey 1L",
    promocao: false,
  },
  {
    nome: "Vinho Tinto Suave",
    preco: 42.9,
    imagem: "https://m.media-amazon.com/images/I/71hP9s1vWDL._AC_SL1500_.jpg",
    categoria: "vinho",
    descricao: "Garrafa 750ml",
    promocao: false,
  },
  {
    nome: "Coca-Cola 2L",
    preco: 12.9,
    imagem: "https://m.media-amazon.com/images/I/61Kh9v86lYL._AC_SL1200_.jpg",
    categoria: "refrigerante",
    descricao: "Refrigerante 2L",
    promocao: false,
  },
];

const categoryNames = {
  todos: "Todos",
  cerveja: "Cerveja",
  vodka: "Vodka",
  whisky: "Whisky",
  gin: "Gin",
  energetico: "Energético",
  vinho: "Vinho",
  refrigerante: "Refrigerante",
  outros: "Outros",
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  priceFilter: document.getElementById("priceFilter"),
  sortFilter: document.getElementById("sortFilter"),
  categoryChips: document.getElementById("categoryChips"),
  productsGrid: document.getElementById("productsGrid"),
  productsInfo: document.getElementById("productsInfo"),
  cartCount: document.getElementById("cartCount"),
  cartItemsCount: document.getElementById("cartItemsCount"),
  cartTotal: document.getElementById("cartTotal"),
  cartList: document.getElementById("cartList"),
  cartDrawer: document.getElementById("cartDrawer"),
  openCartBtn: document.getElementById("openCartBtn"),
  closeCartBtn: document.getElementById("closeCartBtn"),
  overlay: document.getElementById("overlay"),
  checkoutBtn: document.getElementById("checkoutBtn"),
};

const state = {
  products: [],
  cart: {},
  filters: {
    search: "",
    category: "todos",
    price: "todos",
    sort: "relevancia",
  },
};

const toMoney = (value) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const slugify = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const sanitizeCategory = (category) => {
  const value = slugify(category);
  return value || "outros";
};

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getCategoryLabel = (category) =>
  categoryNames[category] ||
  category
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

const normalizeProduct = (product, index) => {
  const nome = product?.nome ? String(product.nome).trim() : `Bebida ${index + 1}`;
  const preco = Number(product?.preco);

  return {
    id: product?.id ? String(product.id) : `${slugify(nome)}-${index}`,
    nome,
    preco: Number.isFinite(preco) ? preco : 0,
    imagem: product?.imagem ? String(product.imagem).trim() : IMAGE_PLACEHOLDER,
    categoria: sanitizeCategory(product?.categoria),
    descricao: product?.descricao
      ? String(product.descricao).trim()
      : "Produto para maiores de 18 anos",
    promocao: Boolean(product?.promocao),
  };
};

const loadProducts = () => {
  const saved = JSON.parse(localStorage.getItem("produtos"));
  const list = Array.isArray(saved) && saved.length ? saved : defaultProducts;
  state.products = list.map(normalizeProduct);
};

const loadCart = () => {
  const saved = JSON.parse(localStorage.getItem("carrinho"));
  if (!saved || typeof saved !== "object") {
    state.cart = {};
    return;
  }

  const byName = new Map(state.products.map((product) => [product.nome, product]));
  const cart = {};

  for (const [key, value] of Object.entries(saved)) {
    if (!value || typeof value !== "object") continue;

    const quantity = Number(value.qtd);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const productFromName = byName.get(key);
    const id = value.id || (productFromName ? productFromName.id : slugify(key));
    const nome = productFromName ? productFromName.nome : key;
    const preco =
      productFromName?.preco ?? (Number.isFinite(Number(value.preco)) ? Number(value.preco) : 0);

    cart[id] = {
      id,
      nome,
      preco,
      qtd: quantity,
    };
  }

  state.cart = cart;
};

const saveCart = () => {
  localStorage.setItem("carrinho", JSON.stringify(state.cart));
};

const getProductById = (id) => state.products.find((product) => product.id === id);

const getProductQuantity = (id) => state.cart[id]?.qtd || 0;

const renderCategoryChips = () => {
  const categories = [
    "todos",
    ...new Set(state.products.map((product) => product.categoria).filter(Boolean)),
  ];

  elements.categoryChips.innerHTML = categories
    .map(
      (category) =>
        `<button class="chip ${
          state.filters.category === category ? "active" : ""
        }" data-category="${escapeHtml(category)}">${escapeHtml(
          getCategoryLabel(category)
        )}</button>`
    )
    .join("");
};

const getFilteredProducts = () => {
  const searchTerm = state.filters.search.trim().toLowerCase();

  let list = state.products.filter((product) => {
    if (state.filters.category !== "todos" && product.categoria !== state.filters.category) {
      return false;
    }

    if (state.filters.price !== "todos" && product.preco > Number(state.filters.price)) {
      return false;
    }

    if (!searchTerm) return true;

    const searchable = `${product.nome} ${product.categoria} ${product.descricao}`.toLowerCase();
    return searchable.includes(searchTerm);
  });

  if (state.filters.sort === "menor") {
    list = list.sort((a, b) => a.preco - b.preco);
  } else if (state.filters.sort === "maior") {
    list = list.sort((a, b) => b.preco - a.preco);
  } else if (state.filters.sort === "nome") {
    list = list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } else {
    list = list.sort((a, b) => Number(b.promocao) - Number(a.promocao));
  }

  return list;
};

const renderProducts = () => {
  const list = getFilteredProducts();
  elements.productsInfo.textContent = `${list.length} bebida(s) encontrada(s)`;

  if (!list.length) {
    elements.productsGrid.innerHTML =
      '<div class="empty-state">Nenhuma bebida encontrada para esse filtro.</div>';
    return;
  }

  elements.productsGrid.innerHTML = list
    .map(
      (product) => `
      <article class="product-card">
        <div class="product-image">
          ${product.promocao ? '<span class="promo-badge">Promo</span>' : ""}
          <img src="${escapeHtml(product.imagem)}" alt="${escapeHtml(
        product.nome
      )}" onerror="this.src='${IMAGE_PLACEHOLDER}'">
        </div>

        <div class="product-content">
          <span class="cat-label">${escapeHtml(getCategoryLabel(product.categoria))}</span>
          <h3>${escapeHtml(product.nome)}</h3>
          <p>${escapeHtml(product.descricao)}</p>

          <div class="product-footer">
            <span class="price">${toMoney(product.preco)}</span>
            <div class="qty">
              <button type="button" data-remove="${escapeHtml(product.id)}">-</button>
              <span data-qty="${escapeHtml(product.id)}">${getProductQuantity(product.id)}</span>
              <button type="button" data-add="${escapeHtml(product.id)}">+</button>
            </div>
          </div>
        </div>
      </article>
    `
    )
    .join("");
};

const addToCart = (id) => {
  const product = getProductById(id);
  if (!product) return;

  if (!state.cart[id]) {
    state.cart[id] = {
      id,
      nome: product.nome,
      preco: product.preco,
      qtd: 0,
    };
  }

  state.cart[id].qtd += 1;
  saveCart();
  updateCartUI();
  updateVisibleQuantities();
};

const removeFromCart = (id) => {
  if (!state.cart[id]) return;

  state.cart[id].qtd -= 1;

  if (state.cart[id].qtd <= 0) {
    delete state.cart[id];
  }

  saveCart();
  updateCartUI();
  updateVisibleQuantities();
};

const updateVisibleQuantities = () => {
  Object.keys(state.cart).forEach((id) => {
    const qtyElement = document.querySelector(`[data-qty="${CSS.escape(id)}"]`);
    if (qtyElement) {
      qtyElement.textContent = String(state.cart[id].qtd);
    }
  });

  const allVisible = document.querySelectorAll("[data-qty]");
  allVisible.forEach((element) => {
    const id = element.getAttribute("data-qty") || "";
    if (!state.cart[id]) {
      element.textContent = "0";
    }
  });
};

const updateCartUI = () => {
  const items = Object.values(state.cart);
  const totalItems = items.reduce((sum, item) => sum + item.qtd, 0);
  const total = items.reduce((sum, item) => sum + item.preco * item.qtd, 0);

  elements.cartCount.textContent = String(totalItems);
  elements.cartItemsCount.textContent = String(totalItems);
  elements.cartTotal.textContent = toMoney(total);

  if (!items.length) {
    elements.cartList.innerHTML =
      '<li class="cart-item"><small>Seu carrinho está vazio.</small></li>';
    return;
  }

  elements.cartList.innerHTML = items
    .map(
      (item) => `
      <li class="cart-item">
        <div class="cart-item-head">
          <strong>${escapeHtml(item.nome)}</strong>
          <strong>${toMoney(item.preco * item.qtd)}</strong>
        </div>
        <small>${toMoney(item.preco)} cada</small>
        <div class="qty">
          <button type="button" data-cart-remove="${escapeHtml(item.id)}">-</button>
          <span>${item.qtd}</span>
          <button type="button" data-cart-add="${escapeHtml(item.id)}">+</button>
        </div>
      </li>
    `
    )
    .join("");
};

const openCart = () => {
  elements.cartDrawer.classList.add("open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  elements.overlay.hidden = false;
  document.body.style.overflow = "hidden";
};

const closeCart = () => {
  elements.cartDrawer.classList.remove("open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  elements.overlay.hidden = true;
  document.body.style.overflow = "";
};

const buildWhatsappMessage = () => {
  const items = Object.values(state.cart);
  if (!items.length) return "";

  const lines = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.nome} x${item.qtd} - ${toMoney(item.preco * item.qtd)}`
    )
    .join("\n");

  const total = items.reduce((sum, item) => sum + item.preco * item.qtd, 0);

  return encodeURIComponent(
    `Olá! Quero fazer um pedido de bebidas:\n${lines}\n\nTotal: ${toMoney(total)}\nPagamento na entrega.`
  );
};

const bindEvents = () => {
  elements.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderProducts();
    updateVisibleQuantities();
  });

  elements.priceFilter.addEventListener("change", (event) => {
    state.filters.price = event.target.value;
    renderProducts();
    updateVisibleQuantities();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    renderProducts();
    updateVisibleQuantities();
  });

  elements.categoryChips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;

    state.filters.category = chip.getAttribute("data-category") || "todos";
    renderCategoryChips();
    renderProducts();
    updateVisibleQuantities();
  });

  elements.productsGrid.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    if (addButton) {
      addToCart(addButton.getAttribute("data-add"));
      return;
    }

    const removeButton = event.target.closest("[data-remove]");
    if (removeButton) {
      removeFromCart(removeButton.getAttribute("data-remove"));
    }
  });

  elements.cartList.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-cart-add]");
    if (addButton) {
      addToCart(addButton.getAttribute("data-cart-add"));
      return;
    }

    const removeButton = event.target.closest("[data-cart-remove]");
    if (removeButton) {
      removeFromCart(removeButton.getAttribute("data-cart-remove"));
    }
  });

  elements.openCartBtn.addEventListener("click", openCart);
  elements.closeCartBtn.addEventListener("click", closeCart);
  elements.overlay.addEventListener("click", closeCart);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
    }
  });

  elements.checkoutBtn.addEventListener("click", () => {
    const message = buildWhatsappMessage();
    if (!message) {
      alert("Adicione bebidas no carrinho antes de finalizar.");
      return;
    }

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank", "noopener");
  });
};

const init = () => {
  loadProducts();
  loadCart();
  renderCategoryChips();
  renderProducts();
  updateCartUI();
  updateVisibleQuantities();
  bindEvents();
};

init();
