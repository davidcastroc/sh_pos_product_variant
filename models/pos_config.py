# Copyright (C) Softhealer Technologies.
# -*- coding: utf-8 -*-

from odoo import models, fields,api

class PosConfig(models.Model):
    _inherit = 'pos.config'

    sh_pos_display_alternative_products = fields.Boolean(
        string='Display Alternative product')
    sh_pos_enable_product_variants = fields.Boolean(
            string='Enable Product Variants')
    sh_close_popup_after_single_selection = fields.Boolean(
        string='Auto close popup after single variant selection')
    
class ProductTemplateInherit(models.Model):
    _inherit = 'product.template'

    sh_alternative_products = fields.Many2many(
        'product.product', 'sh_table_pos_alternative_products', string='Alternative Products ', domain="[('available_in_pos', '=', True)]")

class ShProductProdct(models.Model):
    _inherit = 'product.product'

    sh_product_tmpl_id = fields.Integer(related='product_tmpl_id.id',string='template ID',)    
    
    @api.model
    def _load_pos_data_fields(self, config_id):
        return super()._load_pos_data_fields(config_id) + ['sh_alternative_products',"sh_product_tmpl_id"]
