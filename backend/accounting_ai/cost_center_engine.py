"""
Cost Center Engine — Automatically assigns departments, branches, divisions, business units, locations,
cost centers, and projects to journal lines based on metadata, keywords, or vendor profiles.
"""

from typing import Dict, Any, Optional

class CostCenterEngine:
    @staticmethod
    def resolve_dimensions(extracted_data: Dict[str, Any], vendor_profile: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        """Analyzes invoice metadata to associate the transaction with cost center tags.
        Looks into lines description, vendor tags, and company structures.
        """
        dimensions = {
            "department": "Finance & Admin",
            "branch": "Head Office",
            "division": "General Operations",
            "business_unit": "ERP Group",
            "location": "Mumbai",
            "cost_center": "General & Admin",
            "project": "Internal Operations",
            "profit_center": "Corp Support"
        }

        # Override with vendor defaults if defined in profile
        if vendor_profile:
            for key in dimensions.keys():
                if vendor_profile.get(f"default_{key}"):
                    dimensions[key] = vendor_profile[f"default_{key}"]
                elif vendor_profile.get(key):
                    dimensions[key] = vendor_profile[key]

        # Scan text / descriptions for keywords
        line_items = extracted_data.get("line_items") or []
        combined_text = (extracted_data.get("vendor_or_customer_name") or "") + " " + (extracted_data.get("billed_to_name") or "")
        for item in line_items:
            combined_text += " " + (item.get("description") or "")
            
        combined_text = combined_text.lower()

        # Keyword mapping rules
        if "cloud" in combined_text or "aws" in combined_text or "google" in combined_text or "software" in combined_text:
            dimensions["department"] = "Engineering"
            dimensions["cost_center"] = "Cloud Infrastructure"
            dimensions["project"] = "SaaS Platform"
        elif "travel" in combined_text or "flight" in combined_text or "hotel" in combined_text or "cab" in combined_text:
            dimensions["department"] = "Sales & Marketing"
            dimensions["cost_center"] = "Client Acquisition"
            dimensions["project"] = "Business Development"
        elif "rent" in combined_text or "office" in combined_text or "electricity" in combined_text:
            dimensions["department"] = "Finance & Admin"
            dimensions["cost_center"] = "Facility Management"

        return dimensions
