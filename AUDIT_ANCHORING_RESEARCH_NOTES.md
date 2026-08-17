# Audit Anchoring Research Notes

**Purpose:** Source register for the AgentFence audit-anchor design. The product prepares a ledger-head proof bundle and can record a customer’s non-secret external-retention receipt. It must not claim that the built-in storage layer is independently immutable or that a receipt alone verifies provider-side WORM enforcement.

| Provider mechanism | Verified capability | AgentFence design implication | Source |
|---|---|---|
| **Amazon S3 Object Lock** | Uses a WORM model. It supports retention periods and legal holds; compliance mode prevents protected object-version deletion or overwrite during the retention period, while governance mode can be overridden by specially permitted users. | A customer-controlled S3 Object Lock bucket can retain exported checkpoint bundles. AgentFence should retain only a non-secret `s3://` reference and require the customer to validate versioning, policy mode, retention duration, permissions, and object lock state. | [AWS Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) |
| **Azure Blob immutable storage** | Provides time-based retention and legal holds for WORM data. Azure documents both container- and version-level policy choices and distinguishes locked from unlocked retention policies. | A customer-controlled Azure Blob location can retain a proof bundle. The customer must choose the scope, lock the retention policy where required, and retain storage policy audit evidence. | [Azure immutable storage](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview) |
| **Google Cloud Storage Bucket Lock** | A locked bucket retention policy cannot be removed or reduced; protected objects cannot be deleted or replaced before retention expiry. Locking is irreversible. | A customer-controlled GCS location can retain a proof bundle. AgentFence must treat `gs://` as a reference only and require the customer to validate the locked bucket policy and retention period. | [Google Cloud Bucket Lock](https://cloud.google.com/storage/docs/bucket-lock) |

## Boundary statement

> A generated AgentFence audit-anchor bundle proves the exported ledger head and its deterministic hash. Independent immutability is a property of the customer’s selected retention service and policy, not the AgentFence database, user interface, or a manually recorded receipt.
