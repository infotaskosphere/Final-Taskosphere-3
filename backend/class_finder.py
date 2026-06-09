"""
Trademark class finder.

Given a free-text description of goods/services, return the most likely
Nice classification classes (1-45) ranked by keyword overlap.

Pure rule-based: a curated keyword dictionary per class. No LLM required.
"""
from __future__ import annotations

import re
from typing import List, Dict

# Class title summary + curated keyword set per class.
# Keywords are lowercase, can be multi-word; matched as substrings on a
# normalised description string.
CLASS_DEFS: Dict[int, Dict] = {
    1: {
        "title": "Chemicals",
        "summary": "Chemicals for industry, science, photography, agriculture",
        "keywords": ["chemical", "adhesive", "industrial chemical", "fertilizer",
                     "plastic raw", "unprocessed plastic", "tanning", "solvent",
                     "catalyst", "compost"],
    },
    2: {
        "title": "Paints",
        "summary": "Paints, varnishes, lacquers, preservatives against rust",
        "keywords": ["paint", "varnish", "lacquer", "pigment", "ink for printing",
                     "primer", "wood stain", "dye"],
    },
    3: {
        "title": "Cosmetics & Cleaning",
        "summary": "Cosmetics, non-medicated toiletries, soaps, cleaning preparations",
        "keywords": ["cosmetic", "soap", "shampoo", "perfume", "lipstick",
                     "deodorant", "face cream", "makeup", "make-up", "lotion",
                     "skincare", "skin care", "hair oil", "toothpaste", "detergent",
                     "cleansing", "bleach"],
    },
    4: {
        "title": "Fuels & Lubricants",
        "summary": "Industrial oils, greases, fuels, candles",
        "keywords": ["fuel", "petrol", "diesel", "lubricant", "grease",
                     "industrial oil", "candle", "wax"],
    },
    5: {
        "title": "Pharmaceuticals",
        "summary": "Pharmaceutical, medical and veterinary preparations",
        "keywords": ["pharma", "pharmaceutical", "medicine", "tablet", "capsule",
                     "drug", "ayurvedic", "homoeopathic", "homeopathic", "vaccine",
                     "supplement", "syrup", "ointment", "diaper", "sanitary napkin",
                     "veterinary"],
    },
    6: {
        "title": "Common Metals",
        "summary": "Common metals, hardware, building materials of metal",
        "keywords": ["metal", "steel", "iron", "aluminium", "copper", "brass",
                     "metal pipe", "metal hardware", "metal door"],
    },
    7: {
        "title": "Machines",
        "summary": "Machines, machine tools, motors (except for land vehicles)",
        "keywords": ["machine", "machinery", "motor", "pump", "industrial machine",
                     "manufacturing equipment", "robot", "conveyor"],
    },
    8: {
        "title": "Hand Tools",
        "summary": "Hand tools and implements (hand-operated)",
        "keywords": ["hand tool", "razor", "knife", "scissors", "cutlery",
                     "hammer", "screwdriver", "wrench"],
    },
    9: {
        "title": "Electronics & Software",
        "summary": "Electronics, computers, software, scientific apparatus",
        "keywords": ["software", "saas", "app", "mobile app", "web app",
                     "computer", "laptop", "smartphone", "mobile phone", "headphone",
                     "earphone", "speaker", "tv", "television", "camera",
                     "electronics", "battery", "charger", "ai", "artificial intelligence",
                     "machine learning", "platform", "downloadable", "cloud",
                     "database", "api", "blockchain", "crypto", "wearable",
                     "smartwatch", "vr", "ar", "iot"],
    },
    10: {
        "title": "Medical Apparatus",
        "summary": "Medical, surgical, dental & veterinary apparatus",
        "keywords": ["medical device", "surgical", "stethoscope", "thermometer",
                     "syringe", "prosthetic", "orthopedic", "hearing aid",
                     "dental", "wheelchair"],
    },
    11: {
        "title": "Lighting & HVAC",
        "summary": "Lighting, heating, cooling, sanitary apparatus",
        "keywords": ["lighting", "lamp", "bulb", "led light", "air conditioner",
                     "ac unit", "refrigerator", "fridge", "heater", "ventilator",
                     "fan", "stove", "oven", "water purifier", "sanitary"],
    },
    12: {
        "title": "Vehicles",
        "summary": "Vehicles, apparatus for locomotion by land, air, or water",
        "keywords": ["vehicle", "car", "automobile", "bike", "motorcycle",
                     "scooter", "bicycle", "truck", "ev", "electric vehicle",
                     "tyre", "tire", "boat", "ship", "aircraft", "drone"],
    },
    13: {
        "title": "Firearms",
        "summary": "Firearms, ammunition, explosives, fireworks",
        "keywords": ["firearm", "gun", "ammunition", "explosive", "firework"],
    },
    14: {
        "title": "Jewellery",
        "summary": "Precious metals, jewellery, horological instruments",
        "keywords": ["jewellery", "jewelry", "gold", "silver", "diamond",
                     "ring", "necklace", "earring", "bracelet", "watch",
                     "wristwatch", "precious metal"],
    },
    15: {
        "title": "Musical Instruments",
        "summary": "Musical instruments",
        "keywords": ["musical instrument", "guitar", "piano", "drum", "violin",
                     "harmonium", "tabla", "flute"],
    },
    16: {
        "title": "Paper & Stationery",
        "summary": "Paper, printed matter, stationery, books",
        "keywords": ["paper", "book", "magazine", "newspaper", "notebook",
                     "pen", "pencil", "stationery", "printed matter", "calendar",
                     "diary", "envelope"],
    },
    17: {
        "title": "Rubber & Plastics",
        "summary": "Rubber, gutta-percha, plastics in extruded form",
        "keywords": ["rubber", "plastic film", "insulating material", "hose",
                     "gasket", "seal"],
    },
    18: {
        "title": "Leather Goods",
        "summary": "Leather, bags, luggage, umbrellas",
        "keywords": ["leather", "handbag", "wallet", "purse", "backpack",
                     "luggage", "suitcase", "umbrella", "briefcase"],
    },
    19: {
        "title": "Building Materials",
        "summary": "Non-metallic building materials",
        "keywords": ["cement", "concrete", "brick", "tile", "marble",
                     "granite", "non-metallic pipe", "wood for construction",
                     "asphalt"],
    },
    20: {
        "title": "Furniture",
        "summary": "Furniture, mirrors, picture frames",
        "keywords": ["furniture", "chair", "table", "bed", "mattress",
                     "sofa", "wardrobe", "mirror", "picture frame", "cushion"],
    },
    21: {
        "title": "Household Utensils",
        "summary": "Household utensils, kitchenware, glassware",
        "keywords": ["utensil", "kitchenware", "cookware", "plate", "bowl",
                     "glassware", "cup", "mug", "bottle", "toothbrush",
                     "comb", "brush"],
    },
    22: {
        "title": "Ropes & Textiles",
        "summary": "Ropes, cords, nets, tents, raw fibrous textile materials",
        "keywords": ["rope", "cord", "net", "tent", "tarpaulin", "raw cotton",
                     "raw fibre", "raw fiber"],
    },
    23: {
        "title": "Yarns & Threads",
        "summary": "Yarns and threads for textile use",
        "keywords": ["yarn", "thread", "sewing thread", "knitting yarn"],
    },
    24: {
        "title": "Fabrics & Linens",
        "summary": "Textiles and substitutes; household linen",
        "keywords": ["fabric", "textile", "linen", "bed sheet", "bedsheet",
                     "curtain", "tablecloth", "towel", "blanket"],
    },
    25: {
        "title": "Clothing",
        "summary": "Clothing, footwear, headgear",
        "keywords": ["clothing", "apparel", "garment", "t-shirt", "tshirt",
                     "shirt", "jeans", "trouser", "pant", "dress", "saree",
                     "kurta", "footwear", "shoes", "sneakers", "sandal",
                     "boots", "cap", "hat", "fashion", "wear", "lingerie",
                     "innerwear", "athleisure"],
    },
    26: {
        "title": "Lace & Embroidery",
        "summary": "Lace, embroidery, ribbons, buttons, artificial flowers",
        "keywords": ["lace", "embroidery", "ribbon", "button", "zipper",
                     "artificial flower"],
    },
    27: {
        "title": "Floor Coverings",
        "summary": "Carpets, rugs, mats, linoleum, wall hangings",
        "keywords": ["carpet", "rug", "mat", "doormat", "linoleum",
                     "wall hanging"],
    },
    28: {
        "title": "Toys & Sports",
        "summary": "Games, toys, sporting and gymnastic articles",
        "keywords": ["toy", "game", "board game", "video game", "playstation",
                     "sport", "sporting good", "gymnastic", "cricket bat",
                     "football", "tennis", "fitness equipment"],
    },
    29: {
        "title": "Meat, Dairy, Preserved Foods",
        "summary": "Meat, fish, poultry, dairy, edible oils, preserved foods",
        "keywords": ["meat", "fish", "poultry", "chicken", "mutton", "beef",
                     "egg", "dairy", "milk", "cheese", "butter", "ghee",
                     "yogurt", "curd", "paneer", "edible oil", "jam",
                     "preserved", "pickle", "frozen food", "dry fruit"],
    },
    30: {
        "title": "Snacks, Coffee, Spices",
        "summary": "Coffee, tea, sugar, rice, flour, bread, pastry, spices",
        "keywords": ["coffee", "tea", "cocoa", "chocolate", "sugar", "rice",
                     "flour", "bread", "biscuit", "cookie", "cake", "pastry",
                     "ice cream", "noodle", "pasta", "spice", "masala",
                     "snack", "namkeen", "chips", "honey", "sauce"],
    },
    31: {
        "title": "Fresh Produce & Plants",
        "summary": "Raw and unprocessed agricultural, horticultural, live animals",
        "keywords": ["fresh fruit", "fresh vegetable", "raw grain", "live animal",
                     "pet food", "seed", "plant", "flower", "fodder"],
    },
    32: {
        "title": "Beverages (Non-alcoholic)",
        "summary": "Beers, non-alcoholic beverages, fruit juices, syrups",
        "keywords": ["beer", "non-alcoholic", "soft drink", "soda", "cola",
                     "fruit juice", "juice", "mineral water", "energy drink",
                     "sports drink", "lemonade"],
    },
    33: {
        "title": "Alcoholic Beverages",
        "summary": "Alcoholic beverages (except beers)",
        "keywords": ["wine", "whisky", "whiskey", "rum", "vodka", "gin",
                     "alcohol", "liquor", "spirit", "brandy", "tequila"],
    },
    34: {
        "title": "Tobacco",
        "summary": "Tobacco, smokers' articles, matches",
        "keywords": ["tobacco", "cigarette", "cigar", "lighter", "match",
                     "vape", "e-cigarette"],
    },
    35: {
        "title": "Advertising & Retail",
        "summary": "Advertising, business management, retail services, e-commerce",
        "keywords": ["advertising", "marketing", "business management",
                     "retail", "retail service", "e-commerce", "ecommerce",
                     "online store", "marketplace", "digital marketing",
                     "branding agency", "consultancy", "consulting",
                     "office function", "hr services", "recruitment"],
    },
    36: {
        "title": "Finance & Insurance",
        "summary": "Insurance, financial affairs, monetary affairs, real estate",
        "keywords": ["insurance", "banking", "bank", "finance", "financial",
                     "loan", "credit card", "investment", "mutual fund",
                     "stock broking", "real estate", "property", "fintech",
                     "wallet", "payment gateway", "lending", "wealth"],
    },
    37: {
        "title": "Construction & Repair",
        "summary": "Building construction; repair; installation services",
        "keywords": ["construction", "building", "repair", "installation",
                     "plumbing", "electrical work", "painting service",
                     "renovation", "maintenance"],
    },
    38: {
        "title": "Telecommunications",
        "summary": "Telecommunications services",
        "keywords": ["telecom", "telecommunication", "mobile network",
                     "broadcasting", "satellite", "internet service provider",
                     "isp", "messaging service", "voip"],
    },
    39: {
        "title": "Transport & Logistics",
        "summary": "Transport, packaging, storage, travel arrangement",
        "keywords": ["transport", "logistics", "shipping", "courier",
                     "delivery", "warehouse", "storage", "travel agency",
                     "tour booking", "freight"],
    },
    40: {
        "title": "Material Treatment",
        "summary": "Treatment of materials (custom manufacturing, printing)",
        "keywords": ["manufacturing service", "custom manufacturing",
                     "printing service", "3d printing", "textile treatment",
                     "metal treatment", "recycling"],
    },
    41: {
        "title": "Education & Entertainment",
        "summary": "Education, training, entertainment, sporting and cultural",
        "keywords": ["education", "training", "school", "college", "university",
                     "coaching", "edtech", "online course", "tuition",
                     "entertainment", "media production", "film production",
                     "music production", "publishing", "event", "gaming",
                     "esport", "sports event", "cultural"],
    },
    42: {
        "title": "Tech / R&D Services",
        "summary": "Scientific and technological services, software development",
        "keywords": ["software development", "saas service", "platform service",
                     "web hosting", "cloud computing", "data analytics",
                     "ai service", "ml service", "design service",
                     "ux design", "ui design", "industrial design",
                     "engineering service", "r&d", "research and development",
                     "scientific research", "cyber security", "cybersecurity"],
    },
    43: {
        "title": "Food & Accommodation",
        "summary": "Restaurants, cafes, hotels, hospitality",
        "keywords": ["restaurant", "cafe", "coffee shop", "bar", "pub",
                     "hotel", "motel", "resort", "hostel", "homestay",
                     "catering", "dining", "food court", "cloud kitchen",
                     "qsr", "quick service restaurant", "hospitality"],
    },
    44: {
        "title": "Medical & Wellness",
        "summary": "Medical, veterinary, hygienic and beauty care services",
        "keywords": ["clinic", "hospital", "medical service", "doctor",
                     "nursing", "telemedicine", "diagnostic", "dental clinic",
                     "salon", "spa", "wellness", "yoga", "fitness centre",
                     "fitness center", "gym", "veterinary clinic", "ayurveda"],
    },
    45: {
        "title": "Legal & Security",
        "summary": "Legal services, security services, personal services",
        "keywords": ["legal service", "law firm", "lawyer", "attorney",
                     "advocate", "trademark", "patent service",
                     "security service", "private investigation",
                     "matrimonial", "dating service"],
    },
}


_STOPWORDS = {
    "a", "an", "and", "for", "of", "the", "to", "with", "in", "on", "by",
    "or", "we", "our", "your", "is", "are", "be", "this", "that", "us",
    "service", "services", "product", "products", "based", "platform",
}


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())


def find_classes(description: str, top: int = 5) -> List[Dict]:
    """
    Return ranked class candidates for a free-text goods/services description.

    Each candidate: {class, title, summary, score, matched_keywords}
    Score is the count of distinct matched keywords, plus a small bump for
    multi-word matches.
    """
    norm = _normalise(description)
    if not norm.strip():
        return []

    # Token set (used as a secondary signal for short descriptions)
    tokens = {t for t in norm.split() if t and t not in _STOPWORDS and len(t) > 2}

    scored: List[Dict] = []
    for cls, info in CLASS_DEFS.items():
        matched = []
        score = 0.0
        for kw in info["keywords"]:
            if not kw:
                continue
            if " " in kw or "-" in kw:
                # Multi-word phrase: substring match is appropriate
                if kw in norm:
                    matched.append(kw)
                    score += 2.0
            else:
                # Single word: require whole-word (token) match to avoid
                # false positives like 'ar' matching inside 'foobar'.
                if kw in tokens:
                    matched.append(kw)
                    score += 1.0
        if matched:
            scored.append({
                "class": cls,
                "title": info["title"],
                "summary": info["summary"],
                "score": round(score, 2),
                "matched_keywords": matched,
            })

    # Tie-break: prefer classes with more distinct matched keywords
    scored.sort(key=lambda x: (x["score"], len(x["matched_keywords"])), reverse=True)

    # Confidence label: top match dominates if its score is at least 1.5x the next
    if scored:
        top_score = scored[0]["score"]
        for s in scored:
            if s["score"] >= top_score * 0.8:
                s["confidence"] = "high"
            elif s["score"] >= top_score * 0.4:
                s["confidence"] = "medium"
            else:
                s["confidence"] = "low"

    return scored[:top]
