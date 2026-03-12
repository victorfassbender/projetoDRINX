const resolveApiBase = () => {
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

const API_BASE = resolveApiBase();
const SESSION_EXPIRED_MESSAGE = "Sessão expirada. Faça login novamente.";

const state = {
  products: [],
  editingId: null,
  panelEventsBound: false,
};

const refs = {
  loginSection: document.getElementById("adminLoginSection"),
  panelSection: document.getElementById("adminPanelSection"),
  loginForm: document.getElementById("adminLoginForm"),
  loginUsername: document.getElementById("adminUsername"),
  loginPassword: document.getElementById("adminPassword"),
  loginBtn: document.getElementById("adminLoginBtn"),
  loginFeedback: document.getElementById("adminLoginFeedback"),
  logoutBtn: document.getElementById("adminLogoutBtn"),
  form: document.getElementById("adminProductForm"),
  productId: document.getElementById("productId"),
  productName: document.getElementById("productName"),
  productCategory: document.getElementById("productCategory"),
  productPrice: document.getElementById("productPrice"),
  productStock: document.getElementById("productStock"),
  productDescription: document.getElementById("productDescription"),
  productIsCombo: document.getElementById("productIsCombo"),
  saveBtn: document.getElementById("saveProductBtn"),
  cancelBtn: document.getElementById("cancelEditBtn"),
  feedback: document.getElementById("adminFeedback"),
  tbody: document.getElementById("adminProductsTbody"),
};

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const parsePriceValue = (value) => {
  const text = String(value || "").trim();
  if (!text) return 0;

  if (text.includes(",") && text.includes(".")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }

  if (text.includes(",")) {
    return Number(text.replace(",", "."));
  }

  return Number(text);
};

const setFeedback = (message, type = "") => {
  if (!refs.feedback) return;
  refs.feedback.textContent = message || "";
  refs.feedback.classList.remove("is-error", "is-success");
  if (type === "error") refs.feedback.classList.add("is-error");
  if (type === "success") refs.feedback.classList.add("is-success");
};

const setLoginFeedback = (message, type = "") => {
  if (!refs.loginFeedback) return;
  refs.loginFeedback.textContent = message || "";
  refs.loginFeedback.classList.remove("is-error", "is-success");
  if (type === "error") refs.loginFeedback.classList.add("is-error");
  if (type === "success") refs.loginFeedback.classList.add("is-success");
};

const showLogin = (message = "", type = "") => {
  if (refs.loginSection) refs.loginSection.hidden = false;
  if (refs.panelSection) refs.panelSection.hidden = true;
  if (refs.logoutBtn) refs.logoutBtn.hidden = true;

  setFeedback("");
  setLoginFeedback(message, type);

  if (refs.loginPassword) {
    refs.loginPassword.value = "";
  }
};

const showPanel = () => {
  if (refs.loginSection) refs.loginSection.hidden = true;
  if (refs.panelSection) refs.panelSection.hidden = false;
  if (refs.logoutBtn) refs.logoutBtn.hidden = false;
  setLoginFeedback("");
};

const requestApi = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const errorMessage = payload?.error || `Falha na requisição (${response.status})`;
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const handleUnauthorized = (message = SESSION_EXPIRED_MESSAGE) => {
  state.products = [];
  renderProducts();
  resetForm();
  showLogin(message, "error");
};

const resetForm = () => {
  state.editingId = null;
  refs.form?.reset();

  if (refs.productId) refs.productId.value = "";
  if (refs.productStock) refs.productStock.value = "0";
  if (refs.saveBtn) refs.saveBtn.textContent = "Salvar produto";
  if (refs.cancelBtn) refs.cancelBtn.hidden = true;
};

const fillFormForEdit = (product) => {
  if (!product) return;

  state.editingId = Number(product.id);
  if (refs.productId) refs.productId.value = String(product.id);
  if (refs.productName) refs.productName.value = product.name || "";
  if (refs.productCategory) refs.productCategory.value = product.category || "";
  if (refs.productPrice) {
    refs.productPrice.value = Number(product.price || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (refs.productStock) refs.productStock.value = String(product.stock || 0);
  if (refs.productDescription) refs.productDescription.value = product.description || "";
  if (refs.productIsCombo) refs.productIsCombo.checked = Boolean(product.isCombo);

  if (refs.saveBtn) refs.saveBtn.textContent = "Atualizar produto";
  if (refs.cancelBtn) refs.cancelBtn.hidden = false;

  refs.productName?.focus();
};

const getProductById = (id) => state.products.find((product) => Number(product.id) === Number(id));

const getBatchQuantityByProductId = (id) => {
  const input = refs.tbody?.querySelector(`input.admin-batch-qty[data-id="${id}"]`);
  const quantity = Math.floor(Number(input?.value || 1));

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 1;
  }

  return quantity;
};

const renderProducts = () => {
  if (!refs.tbody) return;

  if (!state.products.length) {
    refs.tbody.innerHTML =
      '<tr><td colspan="5" class="admin-empty">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  refs.tbody.innerHTML = state.products
    .map((product) => {
      const comboTag = product.isCombo ? '<span class="admin-badge">Combo</span>' : "";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(product.name)}</strong>
            ${comboTag}
            ${product.description ? `<p class="admin-mini">${escapeHtml(product.description)}</p>` : ""}
          </td>
          <td>${escapeHtml(product.category || "Geral")}</td>
          <td>${escapeHtml(formatMoney(product.price || 0))}</td>
          <td><strong>${Number(product.stock || 0)}</strong></td>
          <td>
            <div class="admin-row-actions">
              <label class="admin-batch" aria-label="Quantidade para ajustar estoque">
                <span>Qtd</span>
                <input
                  type="number"
                  class="admin-batch-qty"
                  data-id="${product.id}"
                  min="1"
                  step="1"
                  value="1"
                  inputmode="numeric"
                />
              </label>
              <button type="button" class="btn btn-soft" data-action="stock-inc" data-id="${product.id}">Adicionar item</button>
              <button type="button" class="btn btn-soft" data-action="stock-dec" data-id="${product.id}">Remover item</button>
              <button type="button" class="btn btn-soft" data-action="edit" data-id="${product.id}">Editar</button>
              <button type="button" class="btn btn-soft" data-action="delete" data-id="${product.id}">Excluir item</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};

const loadProducts = async () => {
  setFeedback("Carregando produtos...");

  try {
    const payload = await requestApi("/admin/products", { method: "GET" });
    state.products = Array.isArray(payload?.data) ? payload.data : [];
    renderProducts();
    setFeedback(`${state.products.length} produto(s) no painel.`);
    return true;
  } catch (error) {
    console.error(error);

    if (error?.status === 401) {
      handleUnauthorized();
      return false;
    }

    setFeedback(error.message || "Não foi possível carregar os produtos.", "error");
    return false;
  }
};

const collectPayloadFromForm = () => {
  const name = String(refs.productName?.value || "").trim();
  const category = String(refs.productCategory?.value || "").trim();
  const price = Math.max(0, parsePriceValue(refs.productPrice?.value));
  const stock = Math.max(0, Math.floor(Number(refs.productStock?.value || 0)));
  const description = String(refs.productDescription?.value || "").trim();
  const isCombo = Boolean(refs.productIsCombo?.checked);

  if (!name) {
    throw new Error("Informe o nome do produto.");
  }

  if (!category) {
    throw new Error("Informe a categoria.");
  }

  return {
    name,
    category,
    price,
    stock,
    description,
    isCombo,
    visible: true,
  };
};

const saveProduct = async (event) => {
  event.preventDefault();

  try {
    const payload = collectPayloadFromForm();

    if (state.editingId) {
      await requestApi(`/admin/products/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setFeedback("Produto atualizado com sucesso.", "success");
    } else {
      await requestApi("/admin/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFeedback("Produto cadastrado com sucesso.", "success");
    }

    resetForm();
    await loadProducts();
  } catch (error) {
    console.error(error);

    if (error?.status === 401) {
      handleUnauthorized();
      return;
    }

    setFeedback(error.message || "Falha ao salvar produto.", "error");
  }
};

const updateStock = async (id, delta) => {
  const product = getProductById(id);
  if (!product) return;

  if (delta < 0 && Number(product.stock || 0) <= 0) {
    setFeedback("Não há itens para remover desse produto.", "error");
    return;
  }

  const nextStock = Math.max(0, Number(product.stock || 0) + delta);

  try {
    await requestApi(`/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify({ stock: nextStock }),
    });

    await loadProducts();
    setFeedback("Estoque atualizado.", "success");
  } catch (error) {
    console.error(error);

    if (error?.status === 401) {
      handleUnauthorized();
      return;
    }

    setFeedback(error.message || "Falha ao atualizar estoque.", "error");
  }
};

const deleteProduct = async (id) => {
  const product = getProductById(id);
  if (!product) return;

  const confirmed = window.confirm(`Excluir o produto "${product.name}"?`);
  if (!confirmed) return;

  try {
    await requestApi(`/admin/products/${id}`, { method: "DELETE" });

    if (state.editingId === Number(id)) {
      resetForm();
    }

    await loadProducts();
    setFeedback("Produto excluído.", "success");
  } catch (error) {
    console.error(error);

    if (error?.status === 401) {
      handleUnauthorized();
      return;
    }

    setFeedback(error.message || "Falha ao excluir produto.", "error");
  }
};

const onTableClick = (event) => {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) return;

  const action = button.dataset.action || "";
  const id = Number(button.dataset.id || 0);
  if (!Number.isInteger(id) || id <= 0) return;

  if (action === "edit") {
    fillFormForEdit(getProductById(id));
    return;
  }

  if (action === "delete") {
    void deleteProduct(id);
    return;
  }

  if (action === "stock-inc") {
    const quantity = getBatchQuantityByProductId(id);
    void updateStock(id, quantity);
    return;
  }

  if (action === "stock-dec") {
    const quantity = getBatchQuantityByProductId(id);
    void updateStock(id, -quantity);
  }
};

const bindPanelEvents = () => {
  if (state.panelEventsBound) {
    return;
  }

  refs.form?.addEventListener("submit", saveProduct);
  refs.cancelBtn?.addEventListener("click", () => {
    resetForm();
    setFeedback("Edição cancelada.");
  });
  refs.tbody?.addEventListener("click", onTableClick);

  state.panelEventsBound = true;
};

const submitLogin = async (event) => {
  event.preventDefault();

  const username = String(refs.loginUsername?.value || "").trim();
  const password = String(refs.loginPassword?.value || "").trim();

  if (!username || !password) {
    setLoginFeedback("Informe usuário e senha.", "error");
    return;
  }

  if (refs.loginBtn) refs.loginBtn.disabled = true;
  setLoginFeedback("Validando acesso...");

  try {
    await requestApi("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    showPanel();
    bindPanelEvents();
    resetForm();
    await loadProducts();
  } catch (error) {
    console.error(error);
    setLoginFeedback(error.message || "Falha no login.", "error");
  } finally {
    if (refs.loginBtn) refs.loginBtn.disabled = false;
  }
};

const doLogout = async () => {
  try {
    await requestApi("/admin/logout", {
      method: "POST",
    });
  } catch (error) {
    console.error(error);
  }

  showLogin("Sessão encerrada. Faça login novamente.", "success");
};

const bindAuthEvents = () => {
  refs.loginForm?.addEventListener("submit", submitLogin);
  refs.logoutBtn?.addEventListener("click", doLogout);
};

const restoreSession = async () => {
  try {
    await requestApi("/admin/session", { method: "GET" });
    showPanel();
    bindPanelEvents();
    resetForm();
    await loadProducts();
  } catch (error) {
    if (error?.status === 401) {
      showLogin("Faça login para acessar o painel ADMIN.");
      return;
    }

    console.error(error);
    showLogin("Não foi possível validar a sessão agora.", "error");
  }
};

const init = async () => {
  bindAuthEvents();
  showLogin("Verificando sessão...");
  await restoreSession();
};

void init();
