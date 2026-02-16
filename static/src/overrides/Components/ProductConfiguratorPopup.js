/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { reactive, useState } from "@odoo/owl";
import { ProductConfiguratorPopup } from "@point_of_sale/app/store/product_configurator_popup/product_configurator_popup";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { Input } from "@point_of_sale/app/generic_components/inputs/input/input";

ProductConfiguratorPopup.components.ProductCard = ProductCard;
ProductConfiguratorPopup.components.Input = Input;

patch(ProductConfiguratorPopup.prototype, {
    setup() {
        super.setup();
        this.sh_state = useState({
            shsearchProductWord: "",
            selectedVariant: null,
            selectedAlternative: null,
            warnText: "",
        });
    },

    _getPos() {
        return this.pos || this.env?.pos || window.posmodel || window.pos || null;
    },

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

    _getNativeSelectedVariant() {
        return (
            this.state?.selectedProduct ||
            this.state?.product ||
            this.selectedProduct ||
            this.props?.selectedProduct ||
            null
        );
    },

    get effectiveSelectedVariant() {
        return this.sh_state.selectedVariant || this._getNativeSelectedVariant();
    },

    // =============================
    // ✅ RESOLVERS (la clave del fix)
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
        return this._getAllProducts().find((p) => {
            const pid = this._m2oId(p.product_tmpl_id || p.sh_product_tmpl_id || p.product_tmpl);
            return pid === tmplId;
        }) || null;
    },

    /**
     * Convierte lo que venga en sh_alternative_products a un product.product válido:
     * - si viene product.product -> lo devuelve
     * - si viene product.template -> busca el primer variant (product.product) por tmpl_id
     * - si viene un id -> intenta por product.id y si no, asume que es tmpl_id y busca variant
     * - si viene [id, name] -> usa id
     */
    _resolveToProductProduct(value) {
        if (!value) return null;

        // Record (obj)
        if (typeof value === "object" && !Array.isArray(value)) {
            // Si ya parece product.product (tiene id y template_id)
            if ("id" in value) {
                // 1) Si ese id existe como product.product en POS, úsalo
                const asProduct = this._findProductById(value.id);
                if (asProduct) return asProduct;

                // 2) Si no existe como product.product, puede ser template -> buscar variant por tmpl id
                const tmplId =
                    this._m2oId(value.product_tmpl_id || value.sh_product_tmpl_id || value.product_tmpl) ||
                    value.id; // a veces template solo trae id
                return this._findFirstVariantByTemplateId(tmplId);
            }
            return null;
        }

        // Array: [id, name] o similar
        if (Array.isArray(value)) {
            const id = this._m2oId(value);
            return this._resolveToProductProduct(id);
        }

        // Primitive id (number)
        if (typeof value === "number") {
            // 1) intentar como product.id
            const asProduct = this._findProductById(value);
            if (asProduct) return asProduct;

            // 2) si no, asumir tmpl_id
            return this._findFirstVariantByTemplateId(value);
        }

        return null;
    },

    // =============================
    // Data
    // =============================
    get getAlternativeProduct() {
        const raw = this.props.product?.sh_alternative_products || [];
        // Normalizar: devolver SIEMPRE product.product reales del POS
        const resolved = raw
            .map((x) => this._resolveToProductProduct(x))
            .filter(Boolean);

        // Quitar duplicados por id
        const seen = new Set();
        return resolved.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
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
    // Banner / Images / Price (igual que tenías)
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
    // ✅ CONFIRM (igual, pero ya con alterno válido)
    // =============================
    async confirm() {
        const pos = this._getPos();
        const enabled = pos?.config?.sh_pos_enable_product_variants ?? true;

        if (enabled && this.sh_state.selectedVariant) {
            await reactive(pos).addLineToCurrentOrder({ product_id: this.sh_state.selectedVariant }, {}, false);

            if (this.sh_state.selectedAlternative) {
                await reactive(pos).addLineToCurrentOrder({ product_id: this.sh_state.selectedAlternative }, {}, false);
            }

            this.close?.();
            return;
        }
        
        const res = await super.confirm();

        if (this.sh_state.selectedAlternative) {
            await reactive(pos).addLineToCurrentOrder({ product_id: this.sh_state.selectedAlternative }, {}, false);
        }

        return res;
    },
});
