# -*- coding: utf-8 -*-
{
    "name": "Total Solutions POS",
    "summary": """
        Integrate total solutions device with pos""",
    "description": """
        Long description of module's purpose
    """,
    "author": "Eric Machaira",
    "website": "https://github.com/the-macharia",
    "category": "Point of Sale",
    "version": "17.0.0.1.0",
    # any module necessary for this one to work correctly
    "depends": ["point_of_sale", "oo_total_solutions_esd_api"],
    "version": "17.0.1.0",
    # always loaded
    "data": [
        "views/pos.xml",
    ],
    "assets": {
        "point_of_sale._assets_pos": [
            "oo_total_solutions_pos/static/**/*",
        ],
    },
}
