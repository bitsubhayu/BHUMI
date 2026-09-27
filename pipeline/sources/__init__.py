"""BHUMI data source adapters."""

from pipeline.sources.base import AdapterResult, BaseSourceAdapter
from pipeline.sources.chirps import ChirpsAdapter
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.era5 import Era5Adapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.imd import ImdAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter

__all__ = [
    "AdapterResult",
    "BaseSourceAdapter",
    "ChirpsAdapter",
    "EcmwfAdapter",
    "Era5Adapter",
    "GfsAdapter",
    "GpmImergAdapter",
    "ImdAdapter",
    "SmapAdapter",
    "TeleconnectionsAdapter",
]
