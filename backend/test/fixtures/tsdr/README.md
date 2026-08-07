# TSDR fixture status

`status-response.pending-live-verification.json` is a contract fixture shaped
from the published TSDR JSON schema. It is not claimed to be a live recording.
The endpoint path and API-key header are tested, but the response projection is
explicitly pending live verification once `USPTO_TSDR_API_KEY` is available.

Until that verification happens, `UsptoTsdrAdapter.getStatus()` retains the
entire response as `raw`; no response data is discarded.
