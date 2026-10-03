import { Request, Response } from 'express';
import { DailySale } from '../models/DailySale.js';
import { Product } from '../models/Product.js';
import { PendingAction, IComparisonItem } from '../models/PendingAction.js';
import { getAuthUser } from '../config/authHelper.js';

// Get daily sale sheet for a specific date (or prefilled template of all active items if no sale yet)
export const getDailySaleSheetByDate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.params; // YYYY-MM-DD
    const existingSale = await DailySale.findOne({ date });

    // Fetch all active products
    const activeProducts = await Product.find({ isActive: true }).sort({ category: 1, name: 1 });

    if (existingSale) {
      res.json({
        success: true,
        isExisting: true,
        sale: existingSale,
        activeProducts,
      });
      return;
    }

    // If no sale recorded yet for this date, provide ready-to-fill template
    const templateItems = activeProducts.map((p) => ({
      productId: p._id,
      productName: p.name,
      productSku: p.sku,
      category: p.category,
      cartonSize: p.cartonSize,
      currentStockPcs: p.currentStockPcs,
      quantityCartons: 0,
      quantityPcs: 0,
      totalPcsSold: 0,
      unitTradePrice: p.tradePrice,
      unitDealerPrice: p.dealerPrice,
      totalAmount: 0,
      totalCost: 0,
      grossProfit: 0,
    }));

    res.json({
      success: true,
      isExisting: false,
      date,
      templateItems,
      activeProducts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create or save daily sale (and deduct from inventory)
export const saveDailySale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, memoNo, notes, items } = req.body;
    // items: array of { productId, quantityCartons, quantityPcs }

    if (!date) {
      res.status(400).json({ success: false, message: 'তারিখ নির্বাচন আবশ্যক (YYYY-MM-DD)' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: 'বিক্রয় করার জন্য কোনো আইটেম পাওয়া যায়নি' });
      return;
    }

    // Check if a sale already exists for this date
    let existingSale = await DailySale.findOne({ date });

    // Map previously sold quantities for this date (if updating an existing sale)
    const previouslySoldMap = new Map<string, number>();
    if (existingSale && existingSale.stockDeducted) {
      for (const oldItem of existingSale.items) {
        const pIdStr = oldItem.productId.toString();
        previouslySoldMap.set(pIdStr, (previouslySoldMap.get(pIdStr) || 0) + (oldItem.totalPcsSold || 0));
      }
    }

    // PRE-VALIDATION: Check all items before making any modifications to the DB
    const validationErrors: string[] = [];
    const itemsToProcess: Array<{
      product: any;
      cartonSize: number;
      qtyCartons: number;
      qtyPcs: number;
      totalPcsSold: number;
    }> = [];

    for (const item of items) {
      const qtyCartons = Number(item.quantityCartons) || 0;
      const qtyPcs = Number(item.quantityPcs) || 0;

      if (qtyCartons < 0 || qtyPcs < 0) {
        res.status(400).json({ success: false, message: 'বিক্রয়ের পরিমাণ কখনো ঋণাত্মক হতে পারে না।' });
        return;
      }

      if (qtyCartons === 0 && qtyPcs === 0) continue;

      const product = await Product.findById(item.productId);
      if (!product) {
        validationErrors.push(`আইডি ${item.productId} এর পণ্য খুঁজে পাওয়া যায়নি।`);
        continue;
      }

      const cartonSize = product.cartonSize || 24;
      const totalPcsSold = qtyCartons * cartonSize + qtyPcs;

      if (totalPcsSold > 0) {
        // Effective available stock = current stock + previously sold amount for this same date
        const previouslySold = previouslySoldMap.get(product._id.toString()) || 0;
        const availableStock = (product.currentStockPcs || 0) + previouslySold;

        if (availableStock <= 0) {
          validationErrors.push(
            `"${product.name}" (${product.sku}) পণ্যের গোডাউনে কোনো স্টক নেই (মজুদ: 0 পিস)! স্টক ছাড়া এই পণ্য বিক্রয় করা যাবে না।`
          );
        } else if (totalPcsSold > availableStock) {
          const availCtns = (availableStock / cartonSize).toFixed(1);
          const reqCtns = (totalPcsSold / cartonSize).toFixed(1);
          validationErrors.push(
            `"${product.name}" এর পর্যাপ্ত স্টক নেই! গোডাউনে মজুদ: ${availableStock} পিস (${availCtns} কার্টুন), কিন্তু বিক্রয় এন্ট্রি করেছেন: ${totalPcsSold} পিস (${reqCtns} কার্টুন)।`
          );
        } else {
          itemsToProcess.push({
            product,
            cartonSize,
            qtyCartons,
            qtyPcs,
            totalPcsSold,
          });
        }
      }
    }

    // If any item violates stock availability, reject immediately!
    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: validationErrors[0], // First primary error for toast
        errors: validationErrors,
      });
      return;
    }

    // CHECK USER ROLE: If Admin, submit to Pending instead of direct DB write
    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const comparisonItems: IComparisonItem[] = [];
      const oldItemsMap = new Map<string, any>();
      if (existingSale) {
        for (const it of existingSale.items) {
          oldItemsMap.set(it.productId.toString(), it);
        }
      }

      let beforeTotalAmount = existingSale ? existingSale.totalAmount : 0;
      let beforeTotalCartons = existingSale ? existingSale.totalCartonsSold : 0;
      let beforeTotalPcs = existingSale ? existingSale.totalPcsSold : 0;

      let afterTotalAmount = 0;
      let afterTotalCartons = 0;
      let afterTotalPcs = 0;
      let changedCount = 0;

      for (const it of items) {
        const pId = it.productId?.toString();
        const oldIt = oldItemsMap.get(pId);
        const product = await Product.findById(pId);
        if (!product) continue;

        const cartonSize = product.cartonSize || 24;
        const newCartons = Number(it.quantityCartons) || 0;
        const newPcs = Number(it.quantityPcs) || 0;
        const newTotalPcs = newCartons * cartonSize + newPcs;
        const newAmount = newTotalPcs * product.tradePrice;

        const oldCartons = oldIt ? oldIt.quantityCartons || 0 : 0;
        const oldPcs = oldIt ? oldIt.quantityPcs || 0 : 0;
        const oldTotalPcs = oldIt ? oldIt.totalPcsSold || 0 : 0;
        const oldAmount = oldIt ? oldIt.totalAmount || 0 : 0;

        afterTotalAmount += newAmount;
        afterTotalCartons += newCartons + newPcs / cartonSize;
        afterTotalPcs += newTotalPcs;

        let changeType: 'added' | 'modified' | 'removed' | 'unchanged' = 'unchanged';
        if (oldTotalPcs === 0 && newTotalPcs > 0) {
          changeType = 'added';
          changedCount++;
        } else if (oldTotalPcs > 0 && newTotalPcs === 0) {
          changeType = 'removed';
          changedCount++;
        } else if (oldTotalPcs > 0 && newTotalPcs > 0 && oldTotalPcs !== newTotalPcs) {
          changeType = 'modified';
          changedCount++;
        }

        if (newTotalPcs > 0 || oldTotalPcs > 0) {
          comparisonItems.push({
            productId: pId,
            name: product.name,
            banglaName: product.banglaName,
            sku: product.sku,
            cartonSize,
            changeType,
            before: {
              cartons: oldCartons,
              pcs: oldPcs,
              totalPcs: oldTotalPcs,
              tradePrice: product.tradePrice,
              totalAmount: oldAmount,
            },
            after: {
              cartons: newCartons,
              pcs: newPcs,
              totalPcs: newTotalPcs,
              tradePrice: product.tradePrice,
              totalAmount: newAmount,
            },
            diffDescription:
              changeType === 'added'
                ? `নতুন বিক্রয়: ${newCartons} কা. ${newPcs > 0 ? newPcs + ' পিস' : ''} (৳${newAmount.toLocaleString()})`
                : changeType === 'modified'
                ? `পরিবর্তন: ${oldTotalPcs} পিস ➔ ${newTotalPcs} পিস (${newTotalPcs > oldTotalPcs ? '+' : ''}${newTotalPcs - oldTotalPcs} পিস)`
                : changeType === 'removed'
                ? `বাদ দেওয়া হয়েছে (পূর্বে ছিল ${oldTotalPcs} পিস)`
                : 'অপরিবর্তিত',
          });
        }
      }

      const saleMemoNo = memoNo || `MEMO-${date.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      const pendingAction = new PendingAction({
        actionType: existingSale ? 'UPDATE' : 'CREATE',
        entityType: 'daily_sale',
        entityId: existingSale?._id?.toString(),
        title: `দৈনিক বিক্রয় ${existingSale ? 'হালনাগাদ/সংশোধন' : 'নতুন এন্ট্রি'} • তারিখ: ${date}`,
        summary: `মেমো: ${saleMemoNo} • ${changedCount}টি আইটেম • মোট ৳${afterTotalAmount.toLocaleString('en-IN')}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        oldData: existingSale ? existingSale.toObject() : null,
        newData: {
          date,
          memoNo: saleMemoNo,
          notes: notes || '',
          items,
          totalAmount: afterTotalAmount,
          totalCartonsSold: Number(afterTotalCartons.toFixed(2)),
          totalPcsSold: afterTotalPcs,
        },
        summaryMetrics: {
          beforeTotalAmount,
          afterTotalAmount,
          amountDiff: afterTotalAmount - beforeTotalAmount,
          beforeTotalCartons,
          afterTotalCartons: Number(afterTotalCartons.toFixed(2)),
          cartonsDiff: Number((afterTotalCartons - beforeTotalCartons).toFixed(2)),
          beforeTotalPcs,
          afterTotalPcs,
          pcsDiff: afterTotalPcs - beforeTotalPcs,
          changedItemsCount: changedCount,
        },
        comparison: comparisonItems,
      });

      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: 'অ্যাডমিন বিক্রয় এন্ট্রি সফলভাবে পেন্ডিং-এ পাঠানো হয়েছে! ডিলার অনুমোদন করলে এটি স্টকে কার্যকর ও সেভ হবে।',
        data: pendingAction,
      });
      return;
    }

    // REVERT previous inventory deductions if updating an existing sale (Developer direct save)
    if (existingSale && existingSale.stockDeducted) {
      for (const oldItem of existingSale.items) {
        await Product.findByIdAndUpdate(oldItem.productId, {
          $inc: { currentStockPcs: oldItem.totalPcsSold },
        });
      }
    }

    // Generate memo number if not provided
    const saleMemoNo = memoNo || `MEMO-${date.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

    const processedItems = [];
    let grandTotalAmount = 0;
    let grandTotalCost = 0;
    let grandTotalPcs = 0;
    let grandTotalCartons = 0;

    for (const { product, cartonSize, qtyCartons, qtyPcs, totalPcsSold } of itemsToProcess) {
      // SNAPSHOT current price at exact moment of sale
      const unitTradePrice = product.tradePrice;
      const unitDealerPrice = product.dealerPrice;
      const totalAmount = totalPcsSold * unitTradePrice;
      const totalCost = totalPcsSold * unitDealerPrice;
      const grossProfit = totalAmount - totalCost;

      processedItems.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        category: product.category,
        cartonSize,
        quantityCartons: qtyCartons,
        quantityPcs: qtyPcs,
        totalPcsSold,
        unitTradePrice,
        unitDealerPrice,
        totalAmount,
        totalCost,
        grossProfit,
      });

      grandTotalAmount += totalAmount;
      grandTotalCost += totalCost;
      grandTotalPcs += totalPcsSold;
      grandTotalCartons += qtyCartons + qtyPcs / cartonSize;

      // DEDUCT from product inventory
      await Product.findByIdAndUpdate(product._id, {
        $inc: { currentStockPcs: -totalPcsSold },
      });
    }

    if (existingSale) {
      existingSale.memoNo = saleMemoNo;
      existingSale.notes = notes || '';
      existingSale.items = processedItems as any;
      existingSale.totalAmount = grandTotalAmount;
      existingSale.totalCost = grandTotalCost;
      existingSale.totalProfit = grandTotalAmount - grandTotalCost;
      existingSale.totalCartonsSold = Number(grandTotalCartons.toFixed(2));
      existingSale.totalPcsSold = grandTotalPcs;
      existingSale.stockDeducted = true;
      await existingSale.save();

      res.json({
        success: true,
        message: `Daily sale for ${date} updated and inventory stock adjusted successfully!`,
        data: existingSale,
      });
    } else {
      const newSale = new DailySale({
        date,
        memoNo: saleMemoNo,
        notes: notes || '',
        items: processedItems,
        totalAmount: grandTotalAmount,
        totalCost: grandTotalCost,
        totalProfit: grandTotalAmount - grandTotalCost,
        totalCartonsSold: Number(grandTotalCartons.toFixed(2)),
        totalPcsSold: grandTotalPcs,
        stockDeducted: true,
      });

      await newSale.save();

      res.status(201).json({
        success: true,
        message: `Daily sale for ${date} recorded and inventory stock deducted successfully!`,
        data: newSale,
      });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get list of all daily sales with filters
export const getAllDailySales = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, month, limit = 50 } = req.query;
    const query: any = {};

    if (month) {
      // month format: YYYY-MM
      query.date = { $regex: `^${month}` };
    } else if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const sales = await DailySale.find(query).sort({ date: -1 }).limit(Number(limit));

    // Summary calculations
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.totalProfit, 0);
    const totalPcsSold = sales.reduce((sum, s) => sum + s.totalPcsSold, 0);

    res.json({
      success: true,
      count: sales.length,
      summary: {
        totalRevenue,
        totalProfit,
        totalPcsSold,
      },
      data: sales,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single daily sale by ID
export const getDailySaleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const sale = await DailySale.findById(req.params.id);
    if (!sale) {
      res.status(404).json({ success: false, message: 'Sale record not found' });
      return;
    }
    res.json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete daily sale and revert inventory stock
export const deleteDailySale = async (req: Request, res: Response): Promise<void> => {
  try {
    const sale = await DailySale.findById(req.params.id);
    if (!sale) {
      res.status(404).json({ success: false, message: 'Sale record not found' });
      return;
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const pendingAction = new PendingAction({
        actionType: 'DELETE',
        entityType: 'daily_sale',
        entityId: req.params.id,
        title: `বিক্রয় রেকর্ড মুছে ফেলার আবেদন • তারিখ: ${sale.date}`,
        summary: `মেমো: ${sale.memoNo} • মোট বিক্রয়: ৳${sale.totalAmount.toLocaleString('en-IN')}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        oldData: sale.toObject(),
        summaryMetrics: {
          beforeTotalAmount: sale.totalAmount,
          afterTotalAmount: 0,
          amountDiff: -sale.totalAmount,
          beforeTotalCartons: sale.totalCartonsSold,
          afterTotalCartons: 0,
          cartonsDiff: -sale.totalCartonsSold,
          beforeTotalPcs: sale.totalPcsSold,
          afterTotalPcs: 0,
          pcsDiff: -sale.totalPcsSold,
        },
      });
      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `মেমো ${sale.memoNo} মুছে ফেলার আবেদন পেন্ডিং-এ রাখা হয়েছে। ডিলার অনুমোদনের পর মোছা হবে।`,
        data: pendingAction,
      });
      return;
    }

    // Revert stock deductions (Developer direct delete)
    if (sale.stockDeducted) {
      for (const item of sale.items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { currentStockPcs: item.totalPcsSold },
        });
      }
    }

    await DailySale.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: `Sale record ${sale.memoNo} deleted and stock restored successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
