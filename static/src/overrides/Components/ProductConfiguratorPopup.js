/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { reactive, useState } from "@odoo/owl";
import { ProductConfiguratorPopup } from "@point_of_sale/app/store/product_configurator_popup/product_configurator_popup";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { Input } from "@point_of_sale/app/generic_components/inputs/input/input";

ProductConfiguratorPopup.components.ProductCard = ProductCard;
ProductConfiguratorPopup.components.Input = Input;

patch(ProductConfiguratorPopup.prototype, {
    // =============================
    // Setup
    // =============================
    setup() {
        super.setup();

        this.sh_state = useState({
            shsearchProductWord: "",
            selectedVariant: null,
            selectedAlternative: null,
            warnText: "",
        });

        // ✅ Debug handles globales (para PROD)
        try {
            window.__PCP__ = this; // ProductConfiguratorPopup instance
            window.__POS__ = this._getPos?.() || this.pos || this.env?.pos || null;
            if (window.__ALT_DEBUG__) {
                console.warn("[ALT] Debug handles set: window.__PCP__ (popup), window.__POS__ (pos)");
            }
        } catch (e) {}
    },

    // =============================
    // POS resolver
    // =============================
    _getPos() {
        return this.pos || this.env?.pos || window.posmodel || window.pos || null;
    },

    // Toggle debug: window.__ALT_DEBUG__ = true
    _isDebug() {
        return !!window.__ALT_DEBUG__;
    },

    _debug(label, payload) {
        if (!this._isDebug()) return;
        console.warn(`[ALT-DEBUG] ${label}`, payload);
        try {
            if (Array.isArray(payload)) console.table(payload);
        } catch (e) {}
    },

    // =============================
    // Helpers
    // =============================
    _m2oId(value) {
        if (Array.isArray(value)) return value[0];
        if (value && typeof value === "object" && "id" in value) return value.id;
        return value ?? null;
    },

    _getTemplateIdFromProps() {
        return this._m2oId(
            this.props.product?.product_tmpl_id ||
            this.props.product?.sh_product_tmpl_id ||
            this.props.product?.product_tmpl
        );
    },

    // Variante “nativa” (chips) si existe
    _getNativeSelectedVariant() {
        return (
            this.state?.selectedProduct ||
            this.state?.product ||
            this.selectedProduct ||
            this.props?.selectedProduct ||
            null
        );
    },

    // Variante efectiva: cards o nativo
    get effectiveSelectedVariant() {
        return this.sh_state.selectedVariant || this._getNativeSelectedVariant();
    },

    // =============================
    // Product cache
    // =============================
    _getAllProducts() {
        const pos = this._getPos();
        const productModel = pos?.models?.["product.product"];
        return productModel?.getAll?.() || [];
    },

    _findProductById(id) {
        if (!id) return null;
        return this._getAllProducts().find((p) => p.id === id) || null;
    },

    _findFirstVariantByTemplateId(tmplId) {
        if (!tmplId) return null;
        return (
            this._getAllProducts().find((p) => {
                const pid = this._m2oId(p.product_tmpl_id || p.sh_product_tmpl_id || p.product_tmpl);
                return pid === tmplId;
            }) || null
        );
    },

    /**
     * Convierte sh_alternative_products a product.product válido del POS:
     * - si viene product.product -> ok
     * - si viene product.template -> busca primer variant por tmpl_id
     * - si viene id -> intenta product.id; si no existe, asume tmpl_id
     * - si viene [id,name] -> usa id
     */
    _resolveToProductProduct(value) {
        if (!value) return null;

        // Record object
        if (typeof value === "object" && !Array.isArray(value)) {
            if ("id" in value) {
                // 1) existe como product.product (id)
                const asProduct = this._findProductById(value.id);
                if (asProduct) return asProduct;

                // 2) si no, asumir template
                const tmplId =
                    this._m2oId(value.product_tmpl_id || value.sh_product_tmpl_id || value.product_tmpl) ||
                    value.id;
                return this._findFirstVariantByTemplateId(tmplId);
            }
            return null;
        }

        // Array [id, name]
        if (Array.isArray(value)) {
            const id = this._m2oId(value);
            return this._resolveToProductProduct(id);
        }

        // Number id
        if (typeof value === "number") {
            const asProduct = this._findProductById(value);
            if (asProduct) return asProduct;
            return this._findFirstVariantByTemplateId(value);
        }

        return null;
    },

    // =============================
    // Data
    // =============================
    get getAlternativeProduct() {
        const raw = this.props.product?.sh_alternative_products;

        // ✅ Si el field ni existe en props.product, es loader (PROD)
        if (raw === undefined) {
            if (this._isDebug()) {
                console.warn(
                    "[ALT] sh_alternative_products = undefined en props.product. " +
                        "Esto es 99% loader: el POS no está cargando el field en PROD."
                );
                console.warn("[ALT] props.product snapshot:", this.props.product);
            }
            return [];
        }

        // raw puede ser [] o Proxy(Array)
        const arr = raw || [];

        this._debug("RAW sh_alternative_products", arr);
        this._debug("POS product.product count", [{ count: this._getAllProducts().length }]);

        const resolved = arr.map((x) => this._resolveToProductProduct(x)).filter(Boolean);

        // dedupe
        const seen = new Set();
        const unique = resolved.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

        this._debug(
            "RESOLVED alternos product.product",
            unique.map((p) => ({ id: p.id, name: p.display_name }))
        );

        // Si hay raw pero no resolvió nada => alternos no cargados en POS
        if (arr.length && !unique.length) {
            console.warn(
                "[ALT] Alternos definidos pero NO resolvibles en POS. " +
                    "Casi seguro esos alternos no están cargados en esta sesión POS (categorías/available in POS).",
                { raw: arr }
            );
        }

        return unique;
    },

    get getVarientProduct() {
        const pos = this._getPos();
        const tmplId = this._getTemplateIdFromProps();
        if (!pos || !tmplId) return [];

        const all = this._getAllProducts();
        return all.filter((p) => {
            const pid = this._m2oId(p.product_tmpl_id || p.sh_product_tmpl_id || p.product_tmpl);
            return pid === tmplId;
        });
    },

    get shproductsToDisplay() {
        let list = this.getVarientProduct;
        if (this.sh_state.shsearchProductWord) {
            const w = this.sh_state.shsearchProductWord.toLowerCase();
            list = list.filter((p) => (p.display_name || "").toLowerCase().includes(w));
        }
        return list;
    },

    // =============================
    // Selection
    // =============================
    selectVariant(product) {
        this.sh_state.selectedVariant = product;
        this.sh_state.selectedAlternative = null;
        this.sh_state.warnText = "";
    },

    selectAlternative(product) {
        if (!this.effectiveSelectedVariant) {
            this.sh_state.warnText = "Primero seleccioná una variante para poder elegir un alterno.";
            return;
        }
        this.sh_state.warnText = "";
        this.sh_state.selectedAlternative =
            this.sh_state.selectedAlternative?.id === product?.id ? null : product;
    },

    isVariantSelected(product) {
        return this.sh_state.selectedVariant?.id === product?.id;
    },

    isAlternativeSelected(product) {
        return this.sh_state.selectedAlternative?.id === product?.id;
    },

    // =============================
    // Banner / Images
    // =============================
    get bannerProduct() {
        return this.effectiveSelectedVariant || this.props.product;
    },

    get bannerTitle() {
        return this.bannerProduct?.display_name || "";
    },

    get placeholderImg() {
        return "/web/static/img/placeholder.png";
    },

    _imageUrl(product) {
        if (!product?.id) return this.placeholderImg;
        return `/web/image?model=product.product&id=${product.id}&field=image_128`;
    },

    variantImageUrl(product) {
        return this._imageUrl(product);
    },

    altImageUrl(product) {
        return this._imageUrl(product);
    },

    get bannerImageUrl() {
        return this._imageUrl(this.bannerProduct);
    },

    // =============================
    // Price
    // =============================
    get taxRate() {
        return 0.13;
    },

    getVariantPriceExcl(product) {
        const pos = this._getPos();
        try {
            const pricelist = pos?.pricelist || pos?.config?.pricelist_id;
            if (product?.get_price) {
                const p = product.get_price(pricelist, 1);
                if (typeof p === "number") return p;
            }
        } catch (e) {}
        return (product?.list_price ?? product?.lst_price ?? product?.price ?? 0) || 0;
    },

    getVariantPriceIncl(product) {
        const excl = this.getVariantPriceExcl(product);
        return excl * (1 + this.taxRate);
    },

    getVariantTaxAmount(product) {
        const excl = this.getVariantPriceExcl(product);
        return excl * this.taxRate;
    },

    formatCurrency(amount) {
        const pos = this._getPos();
        try {
            return pos.env.utils.formatCurrency(amount);
        } catch (e) {
            const n = typeof amount === "number" ? amount : parseFloat(amount) || 0;
            return `₡${n.toFixed(2)}`;
        }
    },

    get bannerPriceText() {
        return this.formatCurrency(this.getVariantPriceIncl(this.bannerProduct));
    },

    get bannerTaxText() {
        return this.formatCurrency(this.getVariantTaxAmount(this.bannerProduct));
    },

    altPriceText(product) {
        return this.formatCurrency(this.getVariantPriceIncl(product));
    },

    altTaxText(product) {
        return this.formatCurrency(this.getVariantTaxAmount(product));
    },

    // =============================
    // ✅ Add product: tolerante a builds diferentes
    // =============================
    async _addProductToOrder(product) {
        const pos = this._getPos();
        if (!pos || !product) return;

        // 1) Método tipo store
        if (typeof pos.addLineToCurrentOrder === "function") {
            return await reactive(pos).addLineToCurrentOrder({ product_id: product }, {}, false);
        }

        // 2) Order directo
        const order = pos.get_order?.() || pos.getOrder?.() || pos.selectedOrder;
        if (order?.add_product) {
            return order.add_product(product);
        }

        // 3) Alterno
        if (typeof pos.addProductToCurrentOrder === "function") {
            return pos.addProductToCurrentOrder(product);
        }

        console.error("[ALT] No encontré forma de agregar producto en este build", { pos, product });
    },

    // =============================
    // ✅ Confirm
    // =============================
    async confirm() {
        const pos = this._getPos();
        const enabled = pos?.config?.sh_pos_enable_product_variants ?? true;

        // Caso: variante elegida con tu UI
        if (enabled && this.sh_state.selectedVariant) {
            await this._addProductToOrder(this.sh_state.selectedVariant);

            if (this.sh_state.selectedAlternative) {
                await this._addProductToOrder(this.sh_state.selectedAlternative);
            }

            this.close?.();
            return;
        }

        // Caso: nativo crea la línea, luego agregás alterno
        const res = await super.confirm();

        if (this.sh_state.selectedAlternative) {
            await this._addProductToOrder(this.sh_state.selectedAlternative);
        }

        return res;
    },
});
