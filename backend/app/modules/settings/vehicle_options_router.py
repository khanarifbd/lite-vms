from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.settings.service import read_settings

router = APIRouter(prefix="/settings", tags=["Vehicle Registration Options"])

REGISTRATION_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VEHICLE_OWNER,
)


@router.get("/vehicle-registration-options")
async def get_vehicle_registration_options(
    _: Annotated[User, Depends(require_roles(*REGISTRATION_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, list[dict[str, str]]]:
    settings = await read_settings(session)
    vehicle_types = [
        {"value": item.code, "label": item.label}
        for item in settings.vehicle_categories
        if item.enabled
    ]
    return {
        "vehicle_types": vehicle_types,
        "vehicle_categories": [
            {"value": "private", "label": "Private"},
            {"value": "commercial", "label": "Commercial"},
            {"value": "government", "label": "Government"},
            {"value": "emergency", "label": "Emergency service"},
            {"value": "diplomatic", "label": "Diplomatic"},
        ],
        "usage_types": [
            {"value": "personal", "label": "Personal"},
            {"value": "passenger", "label": "Passenger transport"},
            {"value": "goods", "label": "Goods transport"},
            {"value": "ride_sharing", "label": "Ride sharing"},
            {"value": "rental", "label": "Rental"},
            {"value": "emergency", "label": "Emergency service"},
            {"value": "official", "label": "Official use"},
        ],
        "body_types": [
            {"value": "sedan", "label": "Sedan"},
            {"value": "hatchback", "label": "Hatchback"},
            {"value": "suv", "label": "SUV"},
            {"value": "crossover", "label": "Crossover"},
            {"value": "pickup", "label": "Pickup"},
            {"value": "van", "label": "Van"},
            {"value": "minibus", "label": "Minibus"},
            {"value": "bus", "label": "Bus"},
            {"value": "covered_van", "label": "Covered van"},
            {"value": "open_truck", "label": "Open truck"},
            {"value": "tanker", "label": "Tanker"},
            {"value": "trailer", "label": "Trailer"},
            {"value": "motorcycle", "label": "Motorcycle"},
            {"value": "three_wheeler", "label": "Three wheeler"},
            {"value": "ambulance", "label": "Ambulance"},
            {"value": "other", "label": "Other"},
        ],
        "fuel_types": [
            {"value": "petrol", "label": "Petrol"},
            {"value": "diesel", "label": "Diesel"},
            {"value": "octane", "label": "Octane"},
            {"value": "cng", "label": "CNG"},
            {"value": "lpg", "label": "LPG"},
            {"value": "electric", "label": "Electric"},
            {"value": "hybrid", "label": "Hybrid"},
        ],
        "colors": [
            {"value": "black", "label": "Black"},
            {"value": "white", "label": "White"},
            {"value": "silver", "label": "Silver"},
            {"value": "gray", "label": "Gray"},
            {"value": "red", "label": "Red"},
            {"value": "blue", "label": "Blue"},
            {"value": "green", "label": "Green"},
            {"value": "yellow", "label": "Yellow"},
            {"value": "orange", "label": "Orange"},
            {"value": "brown", "label": "Brown"},
            {"value": "maroon", "label": "Maroon"},
            {"value": "gold", "label": "Gold"},
            {"value": "beige", "label": "Beige"},
            {"value": "other", "label": "Other"},
        ],
    }
