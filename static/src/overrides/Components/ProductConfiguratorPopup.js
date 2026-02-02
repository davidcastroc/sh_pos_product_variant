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

    // -----------------------------
    // Helpers
    // -----------------------------
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

    // -----------------------------
    // Data
    // -----------------------------
    get getAlternativeProduct() {
        return this.props.product?.sh_alternative_products || [];
    },

    get getVarientProduct() {
        const tmplId = this._getTemplateIdFromProps();
        if (!tmplId) return [];

        const all = posmodel?.models?.["product.product"]?.getAll?.() || [];
        return all.filter((p) => {
            const pid = this._m2oId(p.product_tmpl_id || p.sh_product_tmpl_id || p.product_tmpl);
            return pid === tmplId;
        });
    },

    get shproductsToDisplay() {
        let list = this.getVarientProduct;
        if (this.sh_state.shsearchProductWord) {
            const w = this.sh_state.shsearchProductWord.toLowerCase();
            list = list.filter((p) =>
                (p.display_name || "").toLowerCase().includes(w)
            );
        }
        return list;
    },

    // -----------------------------
    // Selection
    // -----------------------------
    selectVariant(product) {
        this.sh_state.selectedVariant = product;
        this.sh_state.selectedAlternative = null;
        this.sh_state.warnText = "";
    },

    selectAlternative(product) {
        if (!this.sh_state.selectedVariant) {
            this.sh_state.warnText =
                "Primero seleccioná una variante para poder elegir un alterno.";
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

    // -----------------------------
    // Banner
    // -----------------------------
    get bannerProduct() {
        return this.sh_state.selectedVariant || this.props.product;
    },

    get bannerTitle() {
        return this.bannerProduct?.display_name || "";
    },

    // -----------------------------
    // Images (forzadas)
    // -----------------------------
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

    // -----------------------------
    // Price (igual que antes)
    // -----------------------------
    get taxRate() {
        return 0.13;
    },

    getVariantPriceExcl(product) {
        try {
            const pricelist = posmodel?.pricelist || posmodel?.config?.pricelist_id;
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
        try {
            return posmodel.env.utils.formatCurrency(amount);
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

    // -----------------------------
    // CONFIRM (FIX DEFINITIVO)
    // -----------------------------
    async confirm() {
        const hasVariants = !!(this.getVarientProduct?.length);
        const enabled = posmodel?.config?.sh_pos_enable_product_variants ?? true;

        // Si hay variantes y usamos nuestro flujo -> NO llames super.confirm()
        // porque el nativo te va a resolver la variante "a su gusto".
        if (enabled && hasVariants) {
            if (!this.sh_state.selectedVariant) {
                this.sh_state.warnText = "Te falta seleccionar una variante.";
                return;
            }

            const selected = this.sh_state.selectedVariant;

            // 1) Agregar EXACTAMENTE la variante seleccionada
            await reactive(posmodel).addLineToCurrentOrder(
                { product_id: selected },
                {},
                false
            );

            // 2) Alterno adicional
            if (this.sh_state.selectedAlternative) {
                await reactive(posmodel).addLineToCurrentOrder(
                    { product_id: this.sh_state.selectedAlternative },
                    {},
                    false
                );
            }

            // 3) Cerrar popup
            this.close?.();
            return;
        }

        // fallback normal
        return super.confirm();
    },
});
