import { Request, Response } from 'express';
import { PendingAction, IPendingAction } from '../models/PendingAction.js';
import { DailySale } from '../models/DailySale.js';
import { StockInward } from '../models/StockInward.js';
import { Product } from '../models/Product.js';
import { getAuthUser } from '../config/authHelper.js';

// ─── Get all pending actions (with optional filters) ──────────────────────────
export const getPendingActions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, entityType, search } = req.query;
    const filter: any = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (entityType && entityType !== 'all') {
      filter.entityType = entityType;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search as string, $options: 'i' } },
        { summary: { $regex: search as string, $options: 'i' } },
        { 'submittedBy.displayName': { $regex: search as string, $options: 'i' } },
        { 'submittedBy.email': { $regex: search as string, $options: 'i' } },
      ];
    }

    const actions = await PendingAction.find(filter).sort({ createdAt: -1 });
    const pendingCount = await PendingAction.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      count: actions.length,
      pendingCount,
      data: actions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get single pending action by ID ──────────────────────────────────────────
export const getPendingActionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const action = await PendingAction.findById(req.params.id);
    if (!action) {
      res.status(404).json({ success: false, message: 'পেন্ডিং রেকর্ড পাওয়া যায়নি' });
      return;
    }
    res.json({ success: true, data: action });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Approve Pending Action (Dealer & Developer) ──────────────────────────────
export const approvePendingAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const user = await getAuthUser(req);
    if (!user || (user.role !== 'dealer' && user.role !== 'developer')) {
      res.status(403).json({
        success: false,
        message: 'শুধুমাত্র ডিলার বা ডেভেলপার পেন্ডিং অনুমোদন করতে পারেন।',
      });
      return;
    }

    const action = await PendingAction.findById(id);
    if (!action) {
      res.status(404).json({ success: false, message: 'পেন্ডিং রেকর্ড পাওয়া যায়নি' });
      return;
    }

    if (action.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: `এই রিকুয়েস্টটি ইতিমধ্যে "${action.status}" অবস্থায় আছে।`,
      });
      return;
    }

    // ── Apply actual database change based on entityType and actionType ──
    if (action.entityType === 'daily_sale') {
      if (action.actionType === 'CREATE' || action.actionType === 'UPDATE') {
        const { date, memoNo, notes: saleNotes, items } = action.newData;

        // Check if an existing sale exists for this date
        let existingSale = await DailySale.findOne({ date });

        // Revert previous inventory deduction if updating
        if (existingSale && existingSale.stockDeducted) {
          for (const oldItem of existingSale.items) {
            await Product.findByIdAndUpdate(oldItem.productId, {
              $inc: { currentStockPcs: oldItem.totalPcsSold },
            });
          }
        }

        // Process items & deduct inventory
        const processedItems = [];
        let grandTotalAmount = 0;
        let grandTotalCost = 0;
        let grandTotalPcs = 0;
        let grandTotalCartons = 0;

        for (const item of items) {
          const qtyCartons = Number(item.quantityCartons) || 0;
          const qtyPcs = Number(item.quantityPcs) || 0;
          const totalPcsSold = qtyCartons * Number(item.cartonSize || 24) + qtyPcs;

          if (totalPcsSold > 0) {
            const product = await Product.findById(item.productId);
            if (!product) continue; // skip if product deleted
            const cartonSize = product.cartonSize || 24;
            // Recalculate totalPcsSold with correct cartonSize from product
            const actualTotalPcs = qtyCartons * cartonSize + qtyPcs;
            const unitTradePrice = product.tradePrice || 0;
            const unitDealerPrice = product.dealerPrice || 0;
            const totalAmount = actualTotalPcs * unitTradePrice;
            const totalCost = actualTotalPcs * unitDealerPrice;
            const grossProfit = totalAmount - totalCost;

            processedItems.push({
              productId: product._id,
              productName: product.name,         // ✅ from DB, not item
              productSku: product.sku,           // ✅ from DB, not item
              category: product.category,        // ✅ from DB, not item
              cartonSize,
              quantityCartons: qtyCartons,
              quantityPcs: qtyPcs,
              totalPcsSold: actualTotalPcs,
              unitTradePrice,
              unitDealerPrice,
              totalAmount,
              totalCost,
              grossProfit,
            });

            grandTotalAmount += totalAmount;
            grandTotalCost += totalCost;
            grandTotalPcs += actualTotalPcs;
            grandTotalCartons += qtyCartons + qtyPcs / cartonSize;

            // Deduct stock
            await Product.findByIdAndUpdate(product._id, {
              $inc: { currentStockPcs: -actualTotalPcs },
            });
          }
        }

        const saleMemoNo = memoNo || `MEMO-${date.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

        if (existingSale) {
          existingSale.memoNo = saleMemoNo;
          existingSale.notes = saleNotes || '';
          existingSale.items = processedItems as any;
          existingSale.totalAmount = grandTotalAmount;
          existingSale.totalCost = grandTotalCost;
          existingSale.totalProfit = grandTotalAmount - grandTotalCost;
          existingSale.totalCartonsSold = Number(grandTotalCartons.toFixed(2));
          existingSale.totalPcsSold = grandTotalPcs;
          existingSale.stockDeducted = true;
          await existingSale.save();
        } else {
          const newSale = new DailySale({
            date,
            memoNo: saleMemoNo,
            notes: saleNotes || '',
            items: processedItems,
            totalAmount: grandTotalAmount,
            totalCost: grandTotalCost,
            totalProfit: grandTotalAmount - grandTotalCost,
            totalCartonsSold: Number(grandTotalCartons.toFixed(2)),
            totalPcsSold: grandTotalPcs,
            stockDeducted: true,
          });
          await newSale.save();
        }
      } else if (action.actionType === 'DELETE') {
        const sale = await DailySale.findById(action.entityId);
        if (sale) {
          if (sale.stockDeducted) {
            for (const item of sale.items) {
              await Product.findByIdAndUpdate(item.productId, {
                $inc: { currentStockPcs: item.totalPcsSold },
              });
            }
          }
          await DailySale.findByIdAndDelete(action.entityId);
        }
      }
    } else if (action.entityType === 'stock_inward') {
      if (action.actionType === 'CREATE') {
        const { challanNo, date, supplier, vehicleNo, receivedBy, notes: inwardNotes, items } = action.newData;

        const processedItems = [];
        let grandTotalCost = 0;
        let grandTotalCartons = 0;
        let grandTotalPcs = 0;

        for (const item of items) {
          const qtyCartons = Number(item.quantityCartons) || 0;
          const qtyPcs = Number(item.quantityPcs) || 0;
          const product = await Product.findById(item.productId);
          if (!product) continue;

          const cartonSize = product.cartonSize || 24;
          const totalPcsReceived = qtyCartons * cartonSize + qtyPcs;

          if (totalPcsReceived > 0) {
            const unitDealerPrice =
              item.unitDealerPrice !== undefined && Number(item.unitDealerPrice) >= 0
                ? Number(item.unitDealerPrice)
                : product.dealerPrice;

            const totalCost = totalPcsReceived * unitDealerPrice;

            processedItems.push({
              productId: product._id,
              productName: product.name,
              productSku: product.sku,
              cartonSize,
              quantityCartons: qtyCartons,
              quantityPcs: qtyPcs,
              totalPcsReceived,
              unitDealerPrice,
              totalCost,
            });

            grandTotalCost += totalCost;
            grandTotalCartons += qtyCartons + qtyPcs / cartonSize;
            grandTotalPcs += totalPcsReceived;

            // Increment inventory stock
            await Product.findByIdAndUpdate(product._id, {
              $inc: { currentStockPcs: totalPcsReceived },
            });
          }
        }

        const stockInward = new StockInward({
          challanNo,
          date,
          supplier: supplier || 'Meghna Beverage Ltd',
          vehicleNo: vehicleNo || '',
          receivedBy: receivedBy || 'Tanvir Traders Store',
          notes: inwardNotes || '',
          items: processedItems,
          totalAmount: grandTotalCost,
          totalCartons: Number(grandTotalCartons.toFixed(2)),
          totalPcs: grandTotalPcs,
          stockAdded: true,
        });

        await stockInward.save();
      } else if (action.actionType === 'DELETE') {
        const inward = await StockInward.findById(action.entityId);
        if (inward) {
          if (inward.stockAdded) {
            for (const item of inward.items) {
              await Product.findByIdAndUpdate(item.productId, {
                $inc: { currentStockPcs: -item.totalPcsReceived },
              });
            }
          }
          await StockInward.findByIdAndDelete(action.entityId);
        }
      }
    } else if (action.entityType === 'product') {
      if (action.actionType === 'CREATE') {
        const p = action.newData;
        const newProduct = new Product({
          sku: p.sku,
          name: p.name,
          banglaName: p.banglaName || '',
          category: p.category,
          cartonSize: Number(p.cartonSize),
          dealerPrice: Number(p.dealerPrice),
          tradePrice: Number(p.tradePrice),
          mrp: Number(p.mrp),
          currentStockPcs: Number(p.initialStockPcs || p.currentStockPcs || 0),
          minStockAlert: Number(p.minStockAlert || 48),
          priceHistory: [
            {
              tradePrice: Number(p.tradePrice),
              dealerPrice: Number(p.dealerPrice),
              effectiveFrom: new Date(),
              note: 'Initial Price Setup',
            },
          ],
        });
        await newProduct.save();
      } else if (action.actionType === 'UPDATE') {
        if (action.newData.batchUpdates) {
          // Batch price update
          for (const item of action.newData.batchUpdates) {
            const product = await Product.findById(item.id);
            if (product) {
              product.tradePrice = item.newTradePrice;
              product.dealerPrice = item.newDealerPrice;
              if (item.newMrp !== undefined) product.mrp = item.newMrp;
              product.priceHistory.push({
                tradePrice: item.newTradePrice,
                dealerPrice: item.newDealerPrice,
                effectiveFrom: new Date(),
                note: action.newData.note || 'ডিলার অনুমোদিত ব্যাচ রেট পরিবর্তন',
              });
              await product.save();
            }
          }
        } else {
          // Single product update
          const product = await Product.findById(action.entityId);
          if (product) {
            const d = action.newData;
            if (d.newTradePrice !== undefined && d.newDealerPrice !== undefined) {
              product.tradePrice = Number(d.newTradePrice);
              product.dealerPrice = Number(d.newDealerPrice);
              if (d.newMrp !== undefined) product.mrp = Number(d.newMrp);
              product.priceHistory.push({
                tradePrice: Number(d.newTradePrice),
                dealerPrice: Number(d.newDealerPrice),
                effectiveFrom: new Date(),
                note: d.note || 'ডিলার অনুমোদিত রেট পরিবর্তন',
              });
            }
            if (d.currentStockPcs !== undefined) product.currentStockPcs = Number(d.currentStockPcs);
            if (d.name) product.name = d.name;
            if (d.banglaName !== undefined) product.banglaName = d.banglaName;
            if (d.category) product.category = d.category;
            if (d.cartonSize) product.cartonSize = Number(d.cartonSize);
            if (d.minStockAlert !== undefined) product.minStockAlert = Number(d.minStockAlert);
            if (d.isActive !== undefined) product.isActive = d.isActive;
            await product.save();
          }
        }
      } else if (action.actionType === 'DELETE') {
        await Product.findByIdAndDelete(action.entityId);
      }
    }

    // Mark as approved
    action.status = 'approved';
    action.reviewedBy = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      role: user.role,
    };
    action.reviewedAt = new Date();
    action.reviewNotes = notes || 'ডিলার কর্তৃক অনুমোদিত হয়েছে।';
    await action.save();

    res.json({
      success: true,
      message: 'পেন্ডিং রিকোয়েস্টটি সফলভাবে অনুমোদন করা হয়েছে এবং ডাটাবেজে সংরক্ষণ করা হয়েছে!',
      data: action,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Reject Pending Action (Dealer & Developer) ──────────────────────────────
export const rejectPendingAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const user = await getAuthUser(req);
    if (!user || (user.role !== 'dealer' && user.role !== 'developer')) {
      res.status(403).json({
        success: false,
        message: 'শুধুমাত্র ডিলার বা ডেভেলপার পেন্ডিং বাতিল করতে পারেন।',
      });
      return;
    }

    const action = await PendingAction.findById(id);
    if (!action) {
      res.status(404).json({ success: false, message: 'পেন্ডিং রেকর্ড পাওয়া যায়নি' });
      return;
    }

    if (action.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: `এই রিকুয়েস্টটি ইতিমধ্যে "${action.status}" অবস্থায় আছে।`,
      });
      return;
    }

    action.status = 'rejected';
    action.reviewedBy = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      role: user.role,
    };
    action.reviewedAt = new Date();
    action.reviewNotes = notes || 'ডিলার কর্তৃক বাতিল করা হয়েছে।';
    await action.save();

    res.json({
      success: true,
      message: 'রিকোয়েস্টটি সফলভাবে বাতিল করা হয়েছে। কোনোরূপ পরিবর্তন কার্যকর হয়নি।',
      data: action,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
