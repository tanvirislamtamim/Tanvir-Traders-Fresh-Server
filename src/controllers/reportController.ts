import { Request, Response } from 'express';
import { DailySale } from '../models/DailySale.js';
import { StockInward } from '../models/StockInward.js';
import { Product } from '../models/Product.js';

// Get monthly overview report (Mash a koto bar mal aslo, koto takar duklo, current koto takar asa, koto sell holo)
export const getMonthlyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.query; // format: YYYY-MM (e.g., 2026-09)

    const targetMonth = (month as string) || new Date().toISOString().slice(0, 7);

    // 1. Get all Stock Inwards for this month
    const inwards = await StockInward.find({
      date: { $regex: `^${targetMonth}` },
    }).sort({ date: 1 });

    const inwardCount = inwards.length;
    const totalInwardTaka = inwards.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalInwardCartons = inwards.reduce((sum, inv) => sum + inv.totalCartons, 0);
    const totalInwardPcs = inwards.reduce((sum, inv) => sum + inv.totalPcs, 0);

    // 2. Get all Daily Sales for this month
    const sales = await DailySale.find({
      date: { $regex: `^${targetMonth}` },
    }).sort({ date: 1 });

    const totalSalesTaka = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalCostTaka = sales.reduce((sum, s) => sum + s.totalCost, 0);
    const totalProfitTaka = sales.reduce((sum, s) => sum + s.totalProfit, 0);
    const totalCartonsSold = sales.reduce((sum, s) => sum + s.totalCartonsSold, 0);
    const totalPcsSold = sales.reduce((sum, s) => sum + s.totalPcsSold, 0);

    // 3. ALL-TIME Stock Inward & Daily Sale — stock calculate korbo directly MongoDB theke
    //    Product.currentStockPcs use korbo na — karon initialStockPcs oke affect kore
    const allInwards = await StockInward.find({});
    const allSales   = await DailySale.find({});

    // Per-product: total pcs received (all time)
    const inwardByProduct: Record<string, number> = {};
    for (const inv of allInwards) {
      for (const itm of inv.items) {
        const pId = itm.productId.toString();
        inwardByProduct[pId] = (inwardByProduct[pId] || 0) + itm.totalPcsReceived;
      }
    }

    // Per-product: total pcs sold (all time)
    const soldByProduct: Record<string, number> = {};
    for (const sl of allSales) {
      for (const itm of sl.items) {
        const pId = itm.productId.toString();
        soldByProduct[pId] = (soldByProduct[pId] || 0) + itm.totalPcsSold;
      }
    }

    // 4. This-month movements per product
    const productMonthlyStats: Record<string, { inwardPcs: number; soldPcs: number }> = {};

    for (const inv of inwards) {
      for (const itm of inv.items) {
        const pId = itm.productId.toString();
        if (!productMonthlyStats[pId]) productMonthlyStats[pId] = { inwardPcs: 0, soldPcs: 0 };
        productMonthlyStats[pId].inwardPcs += itm.totalPcsReceived;
      }
    }
    for (const sl of sales) {
      for (const itm of sl.items) {
        const pId = itm.productId.toString();
        if (!productMonthlyStats[pId]) productMonthlyStats[pId] = { inwardPcs: 0, soldPcs: 0 };
        productMonthlyStats[pId].soldPcs += itm.totalPcsSold;
      }
    }

    // 5. Build product summaries
    const products = await Product.find({ isActive: true }).sort({ category: 1, name: 1 });

    let currentTotalStockValueDP = 0;
    let currentTotalStockValueTP = 0;
    let currentTotalStockPcs = 0;
    let currentTotalStockCartons = 0;
    const lowStockItems: Array<{
      productId: any;
      name: string;
      sku: string;
      currentStockPcs: number;
      currentStockCartons: number;
      minStockAlert: number;
    }> = [];

    const itemSummaries = products.map((p) => {
      const pId = p._id.toString();
      const stats = productMonthlyStats[pId] || { inwardPcs: 0, soldPcs: 0 };
      const cartonSize = p.cartonSize || 24;

      // Current stock = all-time inward minus all-time sold (direct from MongoDB records)
      const currentStockPcs = Math.max(
        0,
        (inwardByProduct[pId] || 0) - (soldByProduct[pId] || 0)
      );
      const currentStockCartons = Number((currentStockPcs / cartonSize).toFixed(1));

      const stockValueDP = currentStockPcs * p.dealerPrice;
      const stockValueTP = currentStockPcs * p.tradePrice;

      currentTotalStockValueDP += stockValueDP;
      currentTotalStockValueTP += stockValueTP;
      currentTotalStockPcs     += currentStockPcs;
      currentTotalStockCartons += currentStockCartons;

      if (currentStockPcs <= p.minStockAlert) {
        lowStockItems.push({
          productId: p._id,
          name: p.name,
          sku: p.sku,
          currentStockPcs,
          currentStockCartons,
          minStockAlert: p.minStockAlert,
        });
      }

      return {
        productId: p._id,
        sku: p.sku,
        name: p.name,
        banglaName: p.banglaName,
        category: p.category,
        cartonSize,
        tradePrice: p.tradePrice,
        dealerPrice: p.dealerPrice,
        inwardPcsThisMonth: stats.inwardPcs,
        soldPcsThisMonth:   stats.soldPcs,
        currentStockPcs,
        currentStockCartons,
        stockValueDP,
        stockValueTP,
      };
    });

    res.json({
      success: true,
      month: targetMonth,
      summary: {
        inwardCount,
        totalInwardTaka,
        totalInwardCartons: Number(totalInwardCartons.toFixed(1)),
        totalInwardPcs,
        totalSalesDays: sales.length,
        totalSalesTaka,
        totalCostTaka,
        totalProfitTaka,
        totalCartonsSold: Number(totalCartonsSold.toFixed(1)),
        totalPcsSold,
        currentTotalStockPcs,
        currentTotalStockCartons: Number(currentTotalStockCartons.toFixed(1)),
        currentTotalStockValueDP,
        currentTotalStockValueTP,
        lowStockCount: lowStockItems.length,
      },
      lowStockItems,
      inwards,
      sales,
      itemSummaries,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// Get Dashboard Summary
export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);

    // Today's sale
    const todaySale = await DailySale.findOne({ date: today });

    // Monthly sales
    const monthlySales = await DailySale.find({ date: { $regex: `^${currentMonth}` } });
    const monthlySalesTaka = monthlySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const monthlyProfitTaka = monthlySales.reduce((sum, s) => sum + s.totalProfit, 0);

    // Monthly inwards
    const monthlyInwards = await StockInward.find({ date: { $regex: `^${currentMonth}` } });
    const inwardCount = monthlyInwards.length;
    const monthlyInwardTaka = monthlyInwards.reduce((sum, inv) => sum + inv.totalAmount, 0);

    // Products & Stock Valuation — directly from MongoDB records (not Product.currentStockPcs)
    const products = await Product.find({ isActive: true });
    const allInwardsForDash = await StockInward.find({});
    const allSalesForDash   = await DailySale.find({});

    const inwardByProd: Record<string, number> = {};
    for (const inv of allInwardsForDash) {
      for (const itm of inv.items) {
        const pId = itm.productId.toString();
        inwardByProd[pId] = (inwardByProd[pId] || 0) + itm.totalPcsReceived;
      }
    }
    const soldByProd: Record<string, number> = {};
    for (const sl of allSalesForDash) {
      for (const itm of sl.items) {
        const pId = itm.productId.toString();
        soldByProd[pId] = (soldByProd[pId] || 0) + itm.totalPcsSold;
      }
    }

    let totalStockValueDP = 0;
    let totalStockValueTP = 0;
    let totalStockPcs = 0;
    let lowStockCount = 0;

    for (const p of products) {
      const pId = p._id.toString();
      const stockPcs = Math.max(0, (inwardByProd[pId] || 0) - (soldByProd[pId] || 0));
      totalStockValueDP += stockPcs * p.dealerPrice;
      totalStockValueTP += stockPcs * p.tradePrice;
      totalStockPcs     += stockPcs;
      if (stockPcs <= p.minStockAlert) lowStockCount++;
    }

    res.json({
      success: true,
      today: {
        date: today,
        hasEntry: !!todaySale,
        saleAmount: todaySale ? todaySale.totalAmount : 0,
        profitAmount: todaySale ? todaySale.totalProfit : 0,
        pcsSold: todaySale ? todaySale.totalPcsSold : 0,
        cartonsSold: todaySale ? todaySale.totalCartonsSold : 0,
      },
      monthly: {
        month: currentMonth,
        salesAmount: monthlySalesTaka,
        profitAmount: monthlyProfitTaka,
        inwardCount,
        inwardAmount: monthlyInwardTaka,
      },
      inventory: {
        totalProductsCount: products.length,
        totalStockPcs,
        totalStockValueDP, // Dealer price total stock value
        totalStockValueTP, // Trade price total stock value
        lowStockCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
