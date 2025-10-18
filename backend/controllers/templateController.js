// controllers/templateController.js
import Template from "../models/templateModel.js";
import Test from "../models/testModel.js";

export const createTemplate = async (req, res) => {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const ownerEmail = req.user.ownerEmail || req.user.email;
    const { testId, behaviorTest, rectangles = [], ellipse, sampleVideo } = req.body || {};

    if (!testId || !behaviorTest) return res.status(400).json({ success: false, message: "Missing testId or behaviorTest" });

    const t = await Test.findOne({ _id: testId, ownerUid }).lean();
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });

    // แทนด้วย upsert (ถ้ามีอยู่แล้วเขียนทับ)
    const payload = {
        ownerUid, ownerEmail, test: testId,
        behaviorTest,
        rectangles: (behaviorTest !== "MorrisWaterMaze") ? rectangles : [],
        ellipse: (behaviorTest === "MorrisWaterMaze") ? ellipse : undefined,
        sampleVideo,
    };
    const doc = await Template.findOneAndUpdate(
        { ownerUid, test: testId },
        { $set: payload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true, runValidators: true }
    );

    // ผูกเข้ากับ Test
    await Test.updateOne({ _id: testId, ownerUid }, { $set: { template: doc._id } });

    return res.status(201).json({ success: true, data: doc });
};

export const getTemplateByTest = async (req, res) => {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { testId } = req.params;
    const t = await Test.findOne({ _id: testId, ownerUid }).select("template").lean();
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });
    if (!t.template) return res.json({ success: true, data: null });
    const tpl = await Template.findById(t.template).lean();
    return res.json({ success: true, data: tpl });
};

export const updateTemplate = async (req, res) => {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { id } = req.params;
    const tpl = await Template.findOne({ _id: id, ownerUid });
    if (!tpl) return res.status(404).json({ success: false, message: "Template not found" });

    const { rectangles, ellipse, sampleVideo } = req.body || {};
    if (tpl.behaviorTest === "MorrisWaterMaze") {
        if (ellipse !== undefined) tpl.ellipse = ellipse;
        tpl.rectangles = []; // ensure empty
    } else {
        if (Array.isArray(rectangles)) tpl.rectangles = rectangles;
        tpl.ellipse = undefined;
    }
    if (sampleVideo !== undefined) tpl.sampleVideo = sampleVideo;

    await tpl.save();
    return res.json({ success: true, data: tpl });
};
