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
            selectedVariant: null,       // siempre por cards
            selectedAlternative: null,
            warnText: "",
        });
    },

    // ---- data
    get getAlternativeProduct() {
        return this.props.product?.sh_alternative_products || [];
    },

    get getVarientProduct() {
        // NO filtrar por display_type: si no, te quedás sin cards y cae al configurador nativo
        const tmplId = this.props.product?.sh_product_tmpl_id;
        if (!tmplId) return [];
        return posmodel.models["product.product"]
            .getAll()
            .filter((p) => p.sh_product_tmpl_id === tmplId);
    },

    get shproductsToDisplay() {
        let productsToDisplay = this.getVarientProduct;
        if (this.sh_state.shsearchProductWord) {
            const w = this.sh_state.shsearchProductWord.toLowerCase();
            productsToDisplay = productsToDisplay.filter((p) =>
                (p.display_name || "").toLowerCase().includes(w)
            );
        }
        return productsToDisplay;
    },

    // ---- selection
    selectVariant(product) {
        this.sh_state.selectedVariant = product;
        this.sh_state.selectedAlternative = null;
        this.sh_state.warnText = "";
    },

    selectAlternative(product) {
        // (si querés permitir alterno SIN variante, quitá este if)
        if (!this.sh_state.selectedVariant) {
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

    // ---- banner (arriba: variante seleccionada o producto base)
    get bannerProduct() {
        return this.sh_state.selectedVariant || this.props.product;
    },

    get bannerTitle() {
        return this.bannerProduct?.display_name || "";
    },

    // ---- banner alterno (para una barra abajo de "PRODUCTOS ALTERNOS" si lo querés)
    get altBannerProduct() {
        return this.sh_state.selectedAlternative || null;
    },

    get altBannerTitle() {
        return this.altBannerProduct?.display_name || "";
    },

    // ---- placeholder image (para que cards existan aunque no haya imagen)
    get placeholderImg() {
        return "/web/static/img/placeholder.png";
    },

    variantImageUrl(product) {
        try {
            const url =
                posmodel.config.show_product_images && product?.getImageUrl
                    ? product.getImageUrl()
                    : null;
            return url || this.placeholderImg;
        } catch (e) {
            return this.placeholderImg;
        }
    },

    altImageUrl(product) {
        try {
            const url =
                posmodel.config.show_product_images && product?.getImageUrl
                    ? product.getImageUrl()
                    : null;
            return url || this.placeholderImg;
        } catch (e) {
            return this.placeholderImg;
        }
    },

    get bannerImageUrl() {
        const p = this.bannerProduct;
        try {
            const url =
                posmodel.config.show_product_images && p?.getImageUrl
                    ? p.getImageUrl()
                    : null;
            return url || this.placeholderImg;
        } catch (e) {
            return this.placeholderImg;
        }
    },

    get altBannerImageUrl() {
        const p = this.altBannerProduct;
        if (!p) return null;
        try {
            const url =
                posmodel.config.show_product_images && p?.getImageUrl
                    ? p.getImageUrl()
                    : null;
            return url || this.placeholderImg;
        } catch (e) {
            return this.placeholderImg;
        }
    },

    // ---- price
    get taxRate() {
        return 0.13;
    },

    getVariantPriceExcl(product) {
        try {
            const pricelist = posmodel.pricelist || posmodel.config?.pricelist_id;
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
            const n = typeof amount === "number" ? amount : (parseFloat(amount) || 0);
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

    // Para banner alterno (si lo usás en XML)
    get altBannerPriceText() {
        if (!this.altBannerProduct) return "";
        return this.formatCurrency(this.getVariantPriceIncl(this.altBannerProduct));
    },

    get altBannerTaxText() {
        if (!this.altBannerProduct) return "";
        return this.formatCurrency(this.getVariantTaxAmount(this.altBannerProduct));
    },

    // ---- confirm (FIX combos + flujo nativo)
    async confirm() {
        const hasVariants = !!(this.getVarientProduct?.length);

        // Si estamos usando nuestro flujo de variantes por cards
        if (posmodel.config.sh_pos_enable_product_variants && hasVariants) {
            if (!this.sh_state.selectedVariant) {
                this.sh_state.warnText = "Te falta seleccionar una variante.";
                return;
            }

            const originalProduct = this.props.product;

            try {
                // Engañamos al confirm nativo con la variante seleccionada
                this.props.product = this.sh_state.selectedVariant;

                // El confirm nativo maneja combos/atributos/etc
                await super.confirm();
            } finally {
                this.props.product = originalProduct;
            }

            // Alterno: extra (no depende del combo)
            if (this.sh_state.selectedAlternative) {
                await reactive(posmodel).addLineToCurrentOrder(
                    { product_id: this.sh_state.selectedAlternative },
                    {},
                    false
                );
            }

            // Por si tu build no lo cierra solo
            this.close?.();
            return;
        }

        // fallback normal
        return super.confirm();
    },
});
