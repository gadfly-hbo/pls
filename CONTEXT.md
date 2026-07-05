# PLS

PLS is a retail business intelligence system centered on products, channel entities, audience profiles, explainable product-channel fit, and operating feedback.

## Language

**Product Master**:
A stable product business object such as SKU, SPU, style code, listing, or product variant used as the anchor for product profiles, sales facts, and new-product prediction.
_Avoid_: SKU table, product fixture

**Profile Tag**:
A controlled audience, style, price, occasion, intent, or channel tag used consistently across imported profiles, model outputs, and explanations.
_Avoid_: label, crowd word, arbitrary tag

**Platform Portrait**:
An external platform's audience profile shape preserved in its original dimensions and labels before any PLS taxonomy projection.
_Avoid_: profile tag, normalized taxonomy output

**Taxonomy Bridge**:
A controlled projection from an external platform portrait label into an existing PLS Profile Tag, with confidence and explicit unmapped handling.
_Avoid_: taxonomy expansion, label rewrite

**Channel Entity**:
A sellable or audience-bearing channel object such as shop, account, live room, content account, city, trade area, or store.
_Avoid_: channel when the object is actually a shop or account

**Fact Table**:
A versioned and time-windowed observation imported from business systems, such as sales performance or audience profile distribution.
_Avoid_: master table, runtime result

**Product-Channel Sales Fact**:
A fact describing how one product performed in one channel entity during a time window.
_Avoid_: wide table row

**Derived Result**:
A result produced by PLS from source data, such as prediction, match result, recommendation, or review.
_Avoid_: source data, master data
