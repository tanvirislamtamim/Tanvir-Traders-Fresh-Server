import { Request, Response } from 'express';
import { Product } from '../models/Product.js';
import { PendingAction, IComparisonItem } from '../models/PendingAction.js';
import { getAuthUser } from '../config/authHelper.js';

// Get all products (with optional filter for active only)
export const getAllProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, search, activeOnly = 'true' } = req.query;
    const query: any = {};

    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: 'i' } },
        { banglaName: { $regex: search as string, $options: 'i' } },
        { sku: { $regex: search as string, $options: 'i' } },
      ];
    }

    const products = await Product.find(query).sort({ category: 1, name: 1 });

    // Calculate total stock valuation
    const totalStockPcs = products.reduce((acc, p) => acc + Math.max(0, p.currentStockPcs || 0), 0);
    const totalStockValueTP = products.reduce((acc, p) => acc + Math.max(0, p.currentStockPcs || 0) * p.tradePrice, 0);
    const totalStockValueDP = products.reduce((acc, p) => acc + Math.max(0, p.currentStockPcs || 0) * p.dealerPrice, 0);

    res.json({
      success: true,
      count: products.length,
      summary: {
        totalStockPcs,
        totalStockValueTP,
        totalStockValueDP,
      },
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single product
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create product
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sku,
      name,
      banglaName,
      category,
      cartonSize,
      dealerPrice,
      tradePrice,
      mrp,
      initialStockPcs = 0,
      minStockAlert = 48,
    } = req.body;

    const existing = await Product.findOne({ sku });
    if (existing) {
      res.status(400).json({ success: false, message: `Product with SKU ${sku} already exists` });
      return;
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const comparisonItem: IComparisonItem = {
        name,
        banglaName,
        sku,
        cartonSize: Number(cartonSize),
        changeType: 'added',
        before: {},
        after: {
          tradePrice: Number(tradePrice),
          dealerPrice: Number(dealerPrice),
          currentStockPcs: Number(initialStockPcs),
        },
        diffDescription: `নতুন পণ্য: ${name} (TP ৳${tradePrice}, DP ৳${dealerPrice})`,
      };

      const pendingAction = new PendingAction({
        actionType: 'CREATE',
        entityType: 'product',
        title: `নতুন বিস্কুট আইটেম যোগ • ${name} (${sku})`,
        summary: `ক্যাটেগরি: ${category} • টিপি: ৳${tradePrice} • ডিপি: ৳${dealerPrice}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        newData: {
          sku,
          name,
          banglaName,
          category,
          cartonSize: Number(cartonSize),
          dealerPrice: Number(dealerPrice),
          tradePrice: Number(tradePrice),
          mrp: Number(mrp),
          initialStockPcs: Number(initialStockPcs),
          minStockAlert: Number(minStockAlert),
        },
        comparison: [comparisonItem],
      });

      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `নতুন পণ্য "${name}" অনুমোদনের জন্য পেন্ডিং-এ পাঠানো হয়েছে। ডিলার অনুমোদন করলে তালিকায় যুক্ত হবে।`,
        data: pendingAction,
      });
      return;
    }

    const product = new Product({
      sku,
      name,
      banglaName,
      category,
      cartonSize: Number(cartonSize),
      dealerPrice: Number(dealerPrice),
      tradePrice: Number(tradePrice),
      mrp: Number(mrp),
      currentStockPcs: Number(initialStockPcs),
      minStockAlert: Number(minStockAlert),
      priceHistory: [
        {
          tradePrice: Number(tradePrice),
          dealerPrice: Number(dealerPrice),
          effectiveFrom: new Date(),
          note: 'Initial Price Setup',
        },
      ],
    });

    await product.save();
    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update general product details (non-price or basic info, including stock)
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, banglaName, category, cartonSize, mrp, currentStockPcs, minStockAlert, isActive } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    if (name) product.name = name;
    if (banglaName !== undefined) product.banglaName = banglaName;
    if (category) product.category = category;
    if (cartonSize) product.cartonSize = Number(cartonSize);
    if (mrp) product.mrp = Number(mrp);
    if (currentStockPcs !== undefined) product.currentStockPcs = Math.max(0, Number(currentStockPcs));
    if (minStockAlert) product.minStockAlert = Number(minStockAlert);
    if (isActive !== undefined) product.isActive = Boolean(isActive);

    await product.save();
    res.json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reset all products stock to 0 (Developer / Admin function)
export const resetAllStockToZero = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Product.updateMany({}, { $set: { currentStockPcs: 0 } });
    res.json({
      success: true,
      message: `সব পণ্যের স্টক সফলভাবে ০ (শূন্য) করা হয়েছে! মোট ${result.modifiedCount} টি পণ্যের স্টক ০ করা হলো।`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update product price (Admin monthly price change)
// Records price in priceHistory; does NOT alter historical sales!
export const updateProductPrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newTradePrice, newDealerPrice, newMrp, note = 'Monthly Price Revision' } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const tradePriceNum = Number(newTradePrice);
    const dealerPriceNum = Number(newDealerPrice);

    if (isNaN(tradePriceNum) || tradePriceNum < 0) {
      res.status(400).json({ success: false, message: 'Invalid new trade price' });
      return;
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const comparisonItem: IComparisonItem = {
        productId: product._id.toString(),
        name: product.name,
        banglaName: product.banglaName,
        sku: product.sku,
        changeType: 'modified',
        before: {
          tradePrice: product.tradePrice,
          dealerPrice: product.dealerPrice,
          totalAmount: product.mrp,
        },
        after: {
          tradePrice: tradePriceNum,
          dealerPrice: !isNaN(dealerPriceNum) ? dealerPriceNum : product.dealerPrice,
          totalAmount: newMrp ? Number(newMrp) : product.mrp,
        },
        diffDescription: `টিপি: ৳${product.tradePrice} ➔ ৳${tradePriceNum} (${tradePriceNum > product.tradePrice ? '+' : ''}${(tradePriceNum - product.tradePrice).toFixed(2)})`,
      };

      const pendingAction = new PendingAction({
        actionType: 'UPDATE',
        entityType: 'product',
        entityId: id,
        title: `পণ্যের রেট পরিবর্তনের আবেদন • ${product.name}`,
        summary: `টিপি: ৳${product.tradePrice} ➔ ৳${tradePriceNum} • ডিপি: ৳${product.dealerPrice} ➔ ৳${!isNaN(dealerPriceNum) ? dealerPriceNum : product.dealerPrice}`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        oldData: product.toObject(),
        newData: {
          newTradePrice: tradePriceNum,
          newDealerPrice: !isNaN(dealerPriceNum) ? dealerPriceNum : product.dealerPrice,
          newMrp: newMrp ? Number(newMrp) : product.mrp,
          note,
        },
        comparison: [comparisonItem],
      });

      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `"${product.name}" এর রেট পরিবর্তনের আবেদন পেন্ডিং-এ রাখা হয়েছে। ডিলার অনুমোদনের পর কার্যকর হবে।`,
        data: pendingAction,
      });
      return;
    }

    // Direct developer save: Save previous price to history
    product.priceHistory.push({
      tradePrice: product.tradePrice,
      dealerPrice: product.dealerPrice,
      effectiveFrom: new Date(),
      note: note || `Price changed to TP: ${tradePriceNum}, DP: ${dealerPriceNum}`,
    });

    // Update current master price
    product.tradePrice = tradePriceNum;
    if (!isNaN(dealerPriceNum) && dealerPriceNum >= 0) {
      product.dealerPrice = dealerPriceNum;
    }
    if (newMrp && !isNaN(Number(newMrp))) {
      product.mrp = Number(newMrp);
    }

    await product.save();

    res.json({
      success: true,
      message: `Price for "${product.name}" updated successfully. All subsequent daily sales will use TP ৳${tradePriceNum}. Previous sales retain their recorded prices.`,
      data: product,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Batch update product prices (e.g. at start of month)
export const batchUpdatePrices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { updates, note = 'Batch Monthly Price Update' } = req.body;
    // updates: Array of { id, newTradePrice, newDealerPrice, newMrp }

    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ success: false, message: 'No price updates provided' });
      return;
    }

    const authUser = await getAuthUser(req);
    const isAdmin = authUser && authUser.role === 'admin';

    if (isAdmin) {
      const comparisonItems: IComparisonItem[] = [];
      for (const item of updates) {
        const product = await Product.findById(item.id);
        if (product) {
          comparisonItems.push({
            productId: product._id.toString(),
            name: product.name,
            sku: product.sku,
            changeType: 'modified',
            before: {
              tradePrice: product.tradePrice,
              dealerPrice: product.dealerPrice,
            },
            after: {
              tradePrice: Number(item.newTradePrice),
              dealerPrice: Number(item.newDealerPrice),
            },
            diffDescription: `টিপি: ৳${product.tradePrice} ➔ ৳${item.newTradePrice}`,
          });
        }
      }

      const pendingAction = new PendingAction({
        actionType: 'UPDATE',
        entityType: 'product',
        title: `এককালীন ব্যাচ রেট পরিবর্তন • ${comparisonItems.length}টি পণ্য`,
        summary: `মাসিক এককালীন রেট আপডেট (${comparisonItems.length}টি পণ্য)`,
        status: 'pending',
        submittedBy: {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || '',
          role: 'admin',
        },
        newData: {
          batchUpdates: updates,
          note,
        },
        comparison: comparisonItems,
      });

      await pendingAction.save();

      res.status(202).json({
        success: true,
        pending: true,
        message: `সকল পণ্যের নতুন রেট অনুমোদনের জন্য পেন্ডিং-এ পাঠানো হয়েছে। ডিলার অনুমোদন দিলে কার্যকর হবে।`,
        data: pendingAction,
      });
      return;
    }

    const results = [];
    for (const item of updates) {
      const product = await Product.findById(item.id);
      if (product) {
        product.priceHistory.push({
          tradePrice: product.tradePrice,
          dealerPrice: product.dealerPrice,
          effectiveFrom: new Date(),
          note,
        });

        if (item.newTradePrice !== undefined) product.tradePrice = Number(item.newTradePrice);
        if (item.newDealerPrice !== undefined) product.dealerPrice = Number(item.newDealerPrice);
        if (item.newMrp !== undefined) product.mrp = Number(item.newMrp);

        await product.save();
        results.push(product);
      }
    }

    res.json({
      success: true,
      message: `${results.length} product prices updated successfully.`,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
