import { Request, Response } from 'express';
import { StockInward } from '../models/StockInward.js';
import { Product } from '../models/Product.js';
import { PendingAction, IComparisonItem } from '../models/PendingAction.js';
import { getAuthUser } from '../config/authHelper.js';

// Record a new Stock Inward (Challan arrival from Meghna Beverage Ltd)
export const recordStockInward = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challanNo, date, supplier = 'Meghna Beverage Ltd', vehicleNo, receivedBy, notes, items } = req.body;
    // items: array of { productId, quantityCartons, quantityPcs, unitDealerPrice }

    if (!challanNo || !date) {
      res.status(400).json({ success: false, message: 'Challan number and date are required' });
      return;
    }

    const existing = await StockInward.findOne({ challanNo });
    if (existing) {
      res.status(400).json({ success: false, message: `Challan ${challanNo} already exists!` });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: 'At least one item must be included' });
      return;
    }

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
        // Dealer price can be custom or default to product's current dealer price
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
      }
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const comparisonItems: IComparisonItem[] = processedItems.map((item) => ({
        productId: item.productId.toString(),
        name: item.productName,
        sku: item.productSku,
        cartonSize: item.cartonSize,
        changeType: 'added',
        before: { cartons: 0, pcs: 0, totalPcs: 0, totalAmount: 0 },
        after: {
          cartons: item.quantityCartons,
          pcs: item.quantityPcs,
          totalPcs: item.totalPcsReceived,
          dealerPrice: item.unitDealerPrice,
          totalAmount: item.totalCost,
        },
        diffDescription: `চালান আগমন: +${item.quantityCartons} কা. ${item.quantityPcs > 0 ? item.quantityPcs + ' পিস' : ''} (+${item.totalPcsReceived} পিস)`,
      }));

      const pendingAction = new PendingAction({
        actionType: 'CREATE',
        entityType: 'stock_inward',
        title: `নতুন স্টক চালান আগমন • চালান নং: ${challanNo}`,
        summary: `চালান: ${challanNo} • ${processedItems.length}টি পণ্য • মোট ৳${grandTotalCost.toLocaleString('en-IN')}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        newData: {
          challanNo,
          date,
          supplier,
          vehicleNo: vehicleNo || '',
          receivedBy: receivedBy || 'Tanvir Traders Store',
          notes: notes || '',
          items: processedItems,
          totalAmount: grandTotalCost,
          totalCartons: Number(grandTotalCartons.toFixed(2)),
          totalPcs: grandTotalPcs,
        },
        summaryMetrics: {
          beforeTotalAmount: 0,
          afterTotalAmount: grandTotalCost,
          amountDiff: grandTotalCost,
          beforeTotalCartons: 0,
          afterTotalCartons: Number(grandTotalCartons.toFixed(2)),
          cartonsDiff: Number(grandTotalCartons.toFixed(2)),
          beforeTotalPcs: 0,
          afterTotalPcs: grandTotalPcs,
          pcsDiff: grandTotalPcs,
          changedItemsCount: processedItems.length,
        },
        comparison: comparisonItems,
      });

      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `চালান ${challanNo} অনুমোদনের জন্য পেন্ডিং-এ পাঠানো হয়েছে! ডিলার অনুমোদন দিলে গোডাউন স্টক বৃদ্ধি পাবে।`,
        data: pendingAction,
      });
      return;
    }

    // Direct developer save: INCREMENT store inventory stock
    for (const item of processedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { currentStockPcs: item.totalPcsReceived },
      });
    }

    const stockInward = new StockInward({
      challanNo,
      date,
      supplier,
      vehicleNo: vehicleNo || '',
      receivedBy: receivedBy || 'Tanvir Traders Store',
      notes: notes || '',
      items: processedItems,
      totalAmount: grandTotalCost,
      totalCartons: Number(grandTotalCartons.toFixed(2)),
      totalPcs: grandTotalPcs,
      stockAdded: true,
    });

    await stockInward.save();

    res.status(201).json({
      success: true,
      message: `Challan ${challanNo} recorded successfully! ৳${grandTotalCost.toLocaleString()} worth of products added to inventory.`,
      data: stockInward,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all Stock Inward challans with date and month filtering
export const getAllStockInwards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, startDate, endDate, limit = 50 } = req.query;
    const query: any = {};

    if (month) {
      // YYYY-MM
      query.date = { $regex: `^${month}` };
    } else if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const inwards = await StockInward.find(query).sort({ date: -1 }).limit(Number(limit));

    const totalInwardValue = inwards.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalCartons = inwards.reduce((sum, inv) => sum + inv.totalCartons, 0);
    const totalPcs = inwards.reduce((sum, inv) => sum + inv.totalPcs, 0);

    res.json({
      success: true,
      count: inwards.length,
      summary: {
        totalInwardValue,
        totalCartons,
        totalPcs,
      },
      data: inwards,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single Stock Inward by ID
export const getStockInwardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const inward = await StockInward.findById(req.params.id);
    if (!inward) {
      res.status(404).json({ success: false, message: 'Stock inward challan not found' });
      return;
    }
    res.json({ success: true, data: inward });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Stock Inward and revert added inventory stock
export const deleteStockInward = async (req: Request, res: Response): Promise<void> => {
  try {
    const inward = await StockInward.findById(req.params.id);
    if (!inward) {
      res.status(404).json({ success: false, message: 'Stock inward not found' });
      return;
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const pendingAction = new PendingAction({
        actionType: 'DELETE',
        entityType: 'stock_inward',
        entityId: req.params.id,
        title: `চালান মুছে ফেলার আবেদন • চালান নং: ${inward.challanNo}`,
        summary: `চালান: ${inward.challanNo} • মোট ৳${inward.totalAmount.toLocaleString('en-IN')}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        oldData: inward.toObject(),
      });
      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `চালান ${inward.challanNo} মুছে ফেলার আবেদন ডিলার অনুমোদনের জন্য পেন্ডিং-এ রাখা হয়েছে।`,
        data: pendingAction,
      });
      return;
    }

    // Direct developer delete: Revert stock from inventory
    if (inward.stockAdded) {
      for (const item of inward.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.currentStockPcs = Math.max(0, (product.currentStockPcs || 0) - item.totalPcsReceived);
          await product.save();
        }
      }
    }

    await StockInward.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `Challan ${inward.challanNo} deleted and stock deducted back successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
